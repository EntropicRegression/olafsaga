import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluateEmotionWithProvider } from "@/lib/server/emotion";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("emotion2vec provider adapter", () => {
  it("sends the storage object contract to the analyze endpoint", async () => {
    vi.stubEnv(
      "EMOTION_SERVICE_URL",
      "https://emotion2vec-api.example.run.app/",
    );
    vi.stubEnv("EMOTION_SERVICE_TOKEN", "test-token");
    vi.stubEnv(
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "olafsaga-dadachou78.firebasestorage.app",
    );
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          scores: [
            { label: "happy", score: 0.8 },
            { label: "neutral", score: 0.2 },
          ],
          modelVersion: "iic/emotion2vec_plus_base",
          inferenceMs: 123,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await evaluateEmotionWithProvider("audio/test.wav", 1);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://emotion2vec-api.example.run.app/v1/analyze");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer test-token",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      bucket: "olafsaga-dadachou78.firebasestorage.app",
      objectPath: "audio/test.wav",
    });
    expect(result.source).toBe("emotion2vec");
    expect(result.scores[0]).toEqual({ label: "happy", score: 0.8 });
    expect(result.inferenceMs).toBe(123);
  });

  it("matches the bilingual labels emotion2vec+ models return", async () => {
    vi.stubEnv("EMOTION_SERVICE_URL", "https://emotion2vec-api.example.run.app");
    vi.stubEnv("EMOTION_SERVICE_TOKEN", "test-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          scores: [
            { label: "开心/happy", score: 0.7 },
            { label: "中立/neutral", score: 0.2 },
            { label: "<unk>", score: 0.1 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await evaluateEmotionWithProvider("audio/test.wav", 5);

    expect(result.targetRank).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.scores.map((score) => score.label)).toEqual([
      "happy",
      "neutral",
      "unknown",
    ]);
  });
});
