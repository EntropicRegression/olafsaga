import { describe, expect, it } from "vitest";
import {
  selectPendingAudioForRetry,
  shouldRetainPendingAudio,
} from "@/lib/client/pending-audio-policy";
import { TechnicalFailureError } from "@/lib/study/technical-failure";

describe("pending audio retry policy", () => {
  it.each([
    "SEMANTIC_TIMEOUT",
    "EMOTION_SERVICE_UNAVAILABLE",
    "ANALYSIS_FAILED",
  ] as const)("stops automatic retries after %s", (code) => {
    expect(shouldRetainPendingAudio(new TechnicalFailureError(code))).toBe(
      false,
    );
  });

  it.each(["NETWORK_ERROR", "AUDIO_UPLOAD_FAILED"] as const)(
    "retains audio for a recoverable transfer failure: %s",
    (code) => {
      expect(shouldRetainPendingAudio(new TechnicalFailureError(code))).toBe(
        true,
      );
    },
  );

  it("retains audio for an unclassified client failure", () => {
    expect(shouldRetainPendingAudio(new Error("Connection reset"))).toBe(true);
  });

  it("does not retry an attempt that the foreground submission owns", () => {
    const pending = {
      id: "attempt-1",
      blob: new Blob(),
      storagePath: "audio/attempt-1.wav",
      metadata: { sessionId: "session-1" },
      analysis: {
        transcript: "Elsa ran away.",
        durationMs: 5_000,
        speechScores: {
          accuracy: 80,
          fluency: 80,
          prosody: 80,
          monotone: false,
        },
      },
      createdAt: "2026-09-10T00:00:00.000Z",
    };

    expect(
      selectPendingAudioForRetry(
        [pending],
        "session-1",
        new Set(),
        new Set(["attempt-1"]),
      ),
    ).toEqual([]);
  });
});
