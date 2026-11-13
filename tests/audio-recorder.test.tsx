import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { startAzureRecognition } from "@/lib/audio/azure-recognizer";
import { TechnicalFailureError } from "@/lib/study/technical-failure";

vi.mock("@/lib/audio/azure-recognizer", () => ({
  startAzureRecognition: vi.fn(),
}));

const trackStop = vi.fn();
const contextClose = vi.fn();
const contextResume = vi.fn();
let initialContextState: AudioContextState = "running";
let worklets: Array<{ port: { onmessage: ((event: unknown) => void) | null } }> = [];

class FakeAudioContext {
  sampleRate = 16_000;
  state: AudioContextState = initialContextState;
  destination = {};
  audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  createGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
  resume = async () => {
    contextResume();
    this.state = "running";
  };
  close = async () => {
    contextClose();
    this.state = "closed";
  };
}

class FakeAudioWorkletNode {
  port: { onmessage: ((event: unknown) => void) | null } = { onmessage: null };
  connect = vi.fn();
  disconnect = vi.fn();
  constructor() {
    worklets.push(this);
  }
}

function speak(samples = 16_000) {
  worklets.at(-1)?.port.onmessage?.({ data: new Float32Array(samples).fill(0.2) });
}

beforeEach(() => {
  initialContextState = "running";
  worklets = [];
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: trackStop }],
      }),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useAudioRecorder", () => {
  it("releases the microphone when speech recognition fails to stop", async () => {
    vi.mocked(startAzureRecognition).mockResolvedValue({
      stop: () => Promise.reject(new Error("Azure connection lost")),
    });
    const { result } = renderHook(() =>
      useAudioRecorder({ requireAzureSpeech: true }),
    );
    await act(() => result.current.start());
    speak();

    let failure: unknown;
    await act(async () => {
      failure = await result.current.stop().catch((error: unknown) => error);
    });

    expect(failure).toBeInstanceOf(TechnicalFailureError);
    expect((failure as TechnicalFailureError).failure.code).toBe(
      "SPEECH_SERVICE_UNAVAILABLE",
    );
    expect(trackStop).toHaveBeenCalled();
    expect(contextClose).toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });

  it("reports a recording that captured no audio instead of an empty WAV", async () => {
    vi.mocked(startAzureRecognition).mockResolvedValue({
      stop: async () => ({
        transcript: "",
        speechScores: {
          accuracy: null,
          fluency: null,
          prosody: null,
          monotone: false,
        },
      }),
    });
    const { result } = renderHook(() =>
      useAudioRecorder({ requireAzureSpeech: true }),
    );
    await act(() => result.current.start());

    let failure: unknown;
    await act(async () => {
      failure = await result.current.stop().catch((error: unknown) => error);
    });

    expect((failure as TechnicalFailureError).failure?.code).toBe(
      "MICROPHONE_UNAVAILABLE",
    );
    expect(trackStop).toHaveBeenCalled();
  });

  it("resumes an audio context that starts suspended", async () => {
    initialContextState = "suspended";
    vi.mocked(startAzureRecognition).mockResolvedValue({
      stop: async () => ({
        transcript: "Elsa ran away",
        speechScores: {
          accuracy: 80,
          fluency: 80,
          prosody: 80,
          monotone: false,
        },
      }),
    });
    const { result } = renderHook(() =>
      useAudioRecorder({ requireAzureSpeech: true }),
    );
    await act(() => result.current.start());
    speak();

    expect(contextResume).toHaveBeenCalled();
    let captured: { wav: Blob; transcript: string } | undefined;
    await act(async () => {
      captured = await result.current.stop();
    });
    expect(captured?.transcript).toBe("Elsa ran away");
    expect(captured?.wav.size).toBe(44 + 16_000 * 2);
  });
});
