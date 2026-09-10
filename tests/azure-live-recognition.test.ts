import { beforeEach, describe, expect, it, vi } from "vitest";

const speechMocks = vi.hoisted(() => ({
  constructed: vi.fn(),
  fromConfig: vi.fn(),
  setProperty: vi.fn(),
  instances: [] as Array<{
    recognizing?: (sender: unknown, event: { result: { text: string } }) => void;
    recognized?: (sender: unknown, event: unknown) => void;
  }>,
}));

vi.mock("@/lib/client/api", () => ({
  apiFetch: vi.fn(async () => ({
    configured: true,
    token: "test-token",
    region: "eastasia",
  })),
}));

vi.mock("microsoft-cognitiveservices-speech-sdk", () => {
  class SpeechRecognizer {
    recognizing?: (sender: unknown, event: { result: { text: string } }) => void;
    recognized?: (sender: unknown, event: unknown) => void;

    static FromConfig(...args: unknown[]) {
      speechMocks.fromConfig(...args);
      return new SpeechRecognizer(...args);
    }

    constructor(...args: unknown[]) {
      speechMocks.constructed(...args);
      speechMocks.instances.push(this);
    }

    startContinuousRecognitionAsync(resolve: () => void) {
      resolve();
    }

    stopContinuousRecognitionAsync(resolve: () => void) {
      resolve();
    }

    close() {}
  }

  return {
    SpeechConfig: {
      fromAuthorizationToken: vi.fn(() => ({
        setProperty: speechMocks.setProperty,
      })),
    },
    OutputFormat: { Detailed: "detailed" },
    AudioConfig: {
      fromStreamInput: vi.fn(() => ({ close: vi.fn() })),
    },
    AutoDetectSourceLanguageConfig: {
      fromLanguages: vi.fn(() => ({})),
    },
    SpeechRecognizer,
    PronunciationAssessmentConfig: class {
      enableProsodyAssessment = vi.fn();
      applyTo = vi.fn();
    },
    PronunciationAssessmentGradingSystem: { HundredMark: "hundred" },
    PronunciationAssessmentGranularity: { Phoneme: "phoneme" },
    PronunciationAssessmentResult: { fromResult: vi.fn() },
    ResultReason: { RecognizedSpeech: "recognized" },
    PropertyId: {
      SpeechServiceResponse_JsonResult: "json-result",
      SpeechServiceResponse_StablePartialResultThreshold:
        "stable-partial-threshold",
    },
  };
});

import { startAzureRecognition } from "@/lib/audio/azure-recognizer";

describe("Azure live recognition", () => {
  beforeEach(() => {
    speechMocks.constructed.mockClear();
    speechMocks.fromConfig.mockClear();
    speechMocks.setProperty.mockClear();
    speechMocks.instances.length = 0;
  });

  it("uses the fixed English recognizer and forwards interim text", async () => {
    const onInterim = vi.fn();
    const live = await startAzureRecognition({} as MediaStream, onInterim);

    expect(speechMocks.fromConfig).not.toHaveBeenCalled();
    expect(speechMocks.constructed).toHaveBeenCalledOnce();
    expect(speechMocks.setProperty).toHaveBeenCalledWith(
      "stable-partial-threshold",
      "1",
    );

    speechMocks.instances[0].recognizing?.(null, {
      result: { text: "Elsa ran" },
    });
    expect(onInterim).toHaveBeenCalledWith("Elsa ran");

    await live?.stop();
  });
});
