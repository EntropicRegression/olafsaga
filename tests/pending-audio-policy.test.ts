import { describe, expect, it } from "vitest";
import { shouldRetainPendingAudio } from "@/lib/client/pending-audio-policy";
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
});
