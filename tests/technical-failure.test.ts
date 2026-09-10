import { describe, expect, it } from "vitest";
import {
  failureFromError,
  getTechnicalFailure,
  normalizeTechnicalDetail,
  TechnicalFailureError,
} from "@/lib/study/technical-failure";

describe("technical failure messages", () => {
  it("keeps microphone and provider failures distinct", () => {
    const microphone = getTechnicalFailure("MICROPHONE_PERMISSION_DENIED");
    const semantic = getTechnicalFailure("SEMANTIC_AUTH_FAILED");

    expect(microphone.stage).toBe("microphone");
    expect(microphone.userMessage).toContain("麥克風權限");
    expect(semantic.stage).toBe("semantic");
    expect(semantic.userMessage).toContain("憑證驗證失敗");
    expect(semantic.userMessage).toContain("錄音已保留");
  });

  it("preserves a typed provider failure through generic error handling", () => {
    const error = new TechnicalFailureError(
      "EMOTION_AUTH_FAILED",
      "Cloud Run returned HTTP 403.",
    );

    expect(failureFromError(error)).toMatchObject({
      code: "EMOTION_AUTH_FAILED",
      stage: "emotion",
      retryable: true,
    });
  });

  it("always provides a Firestore-safe technical detail", () => {
    expect(normalizeTechnicalDetail(undefined)).toBe(
      "Provider analysis failed.",
    );
    expect(normalizeTechnicalDetail("  ")).toBe("Provider analysis failed.");
    expect(normalizeTechnicalDetail("Cloud Run returned HTTP 502.")).toBe(
      "Cloud Run returned HTTP 502.",
    );
  });
});
