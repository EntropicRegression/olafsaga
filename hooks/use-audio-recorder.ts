"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startAzureRecognition, type LiveRecognition } from "@/lib/audio/azure-recognizer";
import {
  encodeWav,
  mergeFloat32Chunks,
  resamplePcm,
} from "@/lib/audio/wav";
import type { SpeechScores } from "@/lib/study/types";
import { TechnicalFailureError } from "@/lib/study/technical-failure";

interface RecordingResult {
  wav: Blob;
  transcript: string;
  durationMs: number;
  speechScores: SpeechScores;
}

interface WebkitSpeechRecognitionEvent extends Event {
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
  }>;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: WebkitSpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

export function useAudioRecorder(
  options: {
    maximumSeconds?: number;
    demoCode?: string;
    requireAzureSpeech?: boolean;
    onAutoStop?: () => void;
  } = {},
) {
  const maximumSeconds = options.maximumSeconds ?? 30;
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chunks = useRef<Float32Array[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const source = useRef<MediaStreamAudioSourceNode | null>(null);
  const worklet = useRef<AudioWorkletNode | null>(null);
  const silentGain = useRef<GainNode | null>(null);
  const azure = useRef<LiveRecognition | null>(null);
  const browserRecognition = useRef<BrowserSpeechRecognition | null>(null);
  const browserTranscript = useRef("");
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanAudioGraph = useCallback(async () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    browserRecognition.current?.stop();
    browserRecognition.current = null;
    worklet.current?.disconnect();
    source.current?.disconnect();
    silentGain.current?.disconnect();
    stream.current?.getTracks().forEach((track) => track.stop());
    if (audioContext.current?.state !== "closed") {
      await audioContext.current?.close();
    }
    worklet.current = null;
    source.current = null;
    silentGain.current = null;
    stream.current = null;
    audioContext.current = null;
  }, []);

  useEffect(() => () => void cleanAudioGraph(), [cleanAudioGraph]);

  const startBrowserFallback = useCallback(() => {
    const Constructor = window.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let current = "";
      for (let index = 0; index < event.results.length; index += 1) {
        current += `${event.results[index][0].transcript} `;
      }
      browserTranscript.current = current.trim();
      setInterimTranscript(browserTranscript.current);
    };
    recognition.start();
    browserRecognition.current = recognition;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setInterimTranscript("");
    setElapsedSeconds(0);
    chunks.current = [];
    browserTranscript.current = "";
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      const context = new AudioContext();
      // Keep the stream and context reachable from the first await onward, so
      // a failure anywhere below still releases the microphone.
      stream.current = mediaStream;
      audioContext.current = context;
      // Safari starts a context suspended when it is created after an await;
      // a suspended context delivers no frames and the WAV would be empty.
      if (context.state === "suspended") await context.resume();
      await context.audioWorklet.addModule("/pcm-recorder-worklet.js");
      const mediaSource = context.createMediaStreamSource(mediaStream);
      const recorder = new AudioWorkletNode(context, "pcm-recorder");
      const gain = context.createGain();
      gain.gain.value = 0;
      recorder.port.onmessage = (event: MessageEvent<Float32Array>) => {
        chunks.current.push(event.data);
      };
      mediaSource.connect(recorder);
      recorder.connect(gain);
      gain.connect(context.destination);

      source.current = mediaSource;
      worklet.current = recorder;
      silentGain.current = gain;

      try {
        azure.current = await startAzureRecognition(
          mediaStream,
          setInterimTranscript,
          options.demoCode,
        );
      } catch (error) {
        azure.current = null;
        if (options.requireAzureSpeech) throw error;
      }
      if (!azure.current && options.requireAzureSpeech) {
        throw new TechnicalFailureError(
          "SPEECH_NOT_CONFIGURED",
          "Azure Speech did not return a recognition token.",
        );
      }
      if (!azure.current) startBrowserFallback();

      // Only expose the live recording state after speech recognition is ready,
      // so the first spoken words can produce interim transcript events.
      chunks.current = [];
      startedAt.current = Date.now();
      setIsRecording(true);

      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
        setElapsedSeconds(elapsed);
        if (elapsed >= maximumSeconds) options.onAutoStop?.();
      }, 250);
    } catch (caught) {
      await cleanAudioGraph();
      setIsRecording(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "The microphone could not be started.",
      );
      throw caught;
    }
  }, [
    cleanAudioGraph,
    maximumSeconds,
    options,
    startBrowserFallback,
  ]);

  const stop = useCallback(async (): Promise<RecordingResult> => {
    const context = audioContext.current;
    if (!context || !isRecording) {
      throw new Error("No recording is active.");
    }
    setIsRecording(false);
    const durationMs = Date.now() - startedAt.current;
    let recognized: {
      transcript: string;
      speechScores: SpeechScores;
    } = {
      transcript: browserTranscript.current,
      speechScores: {
        accuracy: null,
        fluency: null,
        prosody: null,
        monotone: false,
      },
    };
    let wav: Blob;
    try {
      if (azure.current) {
        const recognition = azure.current;
        azure.current = null;
        try {
          recognized = await recognition.stop();
        } catch (error) {
          throw new TechnicalFailureError(
            "SPEECH_SERVICE_UNAVAILABLE",
            error instanceof Error
              ? error.message
              : "Azure Speech could not finish the recognition.",
            { cause: error },
          );
        }
      }
      const pcm = mergeFloat32Chunks(chunks.current);
      if (pcm.length === 0) {
        // Storage rejects a header-only WAV, which would leave the attempt in
        // the retry queue forever. Ask for a new recording instead.
        throw new TechnicalFailureError(
          "MICROPHONE_UNAVAILABLE",
          "The recording captured no audio frames.",
        );
      }
      wav = encodeWav(resamplePcm(pcm, context.sampleRate, 16_000), 16_000);
    } finally {
      // Runs on every path: a failed stop must not leave the microphone on.
      chunks.current = [];
      await cleanAudioGraph();
    }
    return {
      wav,
      durationMs,
      transcript: recognized.transcript || interimTranscript,
      speechScores: recognized.speechScores,
    };
  }, [cleanAudioGraph, interimTranscript, isRecording]);

  return {
    start,
    stop,
    isRecording,
    elapsedSeconds,
    interimTranscript,
    error,
  };
}
