"use client";

import type { SpeechScores } from "@/lib/study/types";
import { apiFetch } from "@/lib/client/api";

export interface LiveRecognition {
  stop: () => Promise<{
    transcript: string;
    speechScores: SpeechScores;
  }>;
}

interface TokenResponse {
  configured: boolean;
  demo?: boolean;
  token?: string;
  region: string;
}

interface ScoredSegment {
  accuracy: number | null;
  fluency: number | null;
  prosody: number | null;
  duration: number;
  raw?: unknown;
}

export function containsMonotone(value: unknown): boolean {
  if (typeof value === "string") return value.toLowerCase() === "monotone";
  if (Array.isArray(value)) return value.some(containsMonotone);
  if (value && typeof value === "object") {
    return Object.values(value).some(containsMonotone);
  }
  return false;
}

export function aggregateSegments(segments: ScoredSegment[]): SpeechScores {
  const weightedAverage = (
    field: "accuracy" | "fluency" | "prosody",
  ): number | null => {
    const available = segments.filter(
      (segment) => segment[field] !== null,
    );
    if (!available.length) return null;
    const duration = available.reduce(
      (sum, segment) => sum + Math.max(1, segment.duration),
      0,
    );
    return Number(
      (
        available.reduce(
          (sum, segment) =>
            sum + segment[field]! * Math.max(1, segment.duration),
          0,
        ) / duration
      ).toFixed(2),
    );
  };

  return {
    accuracy: weightedAverage("accuracy"),
    fluency: weightedAverage("fluency"),
    prosody: weightedAverage("prosody"),
    monotone: segments.some((segment) => containsMonotone(segment.raw)),
    raw: segments.map((segment) => segment.raw).filter(Boolean),
  };
}

export async function startAzureRecognition(
  stream: MediaStream,
  onInterim: (value: string) => void,
  demoCode?: string,
): Promise<LiveRecognition | null> {
  const token = await apiFetch<TokenResponse>(
    "/api/speech/token",
    { method: "POST", body: "{}" },
    demoCode,
  );
  if (!token.configured || !token.token) return null;

  const sdk = await import("microsoft-cognitiveservices-speech-sdk");
  const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(
    token.token,
    token.region,
  );
  speechConfig.speechRecognitionLanguage = "en-US";
  speechConfig.outputFormat = sdk.OutputFormat.Detailed;
  const audioConfig = sdk.AudioConfig.fromStreamInput(stream);
  const languageConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages([
    "en-US",
    "zh-TW",
  ]);
  const recognizer = sdk.SpeechRecognizer.FromConfig(
    speechConfig,
    languageConfig,
    audioConfig,
  );
  const pronunciation = new sdk.PronunciationAssessmentConfig(
    "",
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    false,
  );
  pronunciation.enableProsodyAssessment = true;
  pronunciation.applyTo(recognizer);

  const finalParts: string[] = [];
  const scoredSegments: ScoredSegment[] = [];
  let scores: SpeechScores = {
    accuracy: null,
    fluency: null,
    prosody: null,
    monotone: false,
  };

  recognizer.recognizing = (_, event) => {
    onInterim([...finalParts, event.result.text].filter(Boolean).join(" "));
  };
  recognizer.recognized = (_, event) => {
    if (event.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
    if (event.result.text) finalParts.push(event.result.text);
    try {
      const result = sdk.PronunciationAssessmentResult.fromResult(event.result);
      const raw = event.result.properties.getProperty(
        sdk.PropertyId.SpeechServiceResponse_JsonResult,
      );
      const parsedRaw = raw ? JSON.parse(raw) : undefined;
      scoredSegments.push({
        accuracy: result.accuracyScore ?? null,
        fluency: result.fluencyScore ?? null,
        prosody: result.prosodyScore ?? null,
        duration: event.result.duration ?? 1,
        raw: parsedRaw,
      });
      scores = aggregateSegments(scoredSegments);
    } catch {
      // The final transcript remains useful even when detailed scores are absent.
    }
    onInterim(finalParts.join(" "));
  };

  await new Promise<void>((resolve, reject) => {
    recognizer.startContinuousRecognitionAsync(resolve, reject);
  });

  return {
    stop: async () => {
      await new Promise<void>((resolve, reject) => {
        recognizer.stopContinuousRecognitionAsync(resolve, reject);
      });
      recognizer.close();
      audioConfig.close();
      return {
        transcript: finalParts.join(" ").trim(),
        speechScores: scores,
      };
    },
  };
}
