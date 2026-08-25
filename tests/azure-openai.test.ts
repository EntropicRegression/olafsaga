import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluateSemanticWithProvider } from "@/lib/server/azure-openai";

const semanticResult = {
  language: "en",
  relevant: true,
  grammarUnderstandable: true,
  matchedFactIds: ["elsa_removed_glove"],
  hasObjectiveFact: true,
  hasFeelingExpression: false,
  contentComplete: true,
  decisionReason: "The response states a required plot fact.",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Azure OpenAI semantic evaluation", () => {
  it("uses a configured Foundry Responses endpoint", async () => {
    vi.stubEnv(
      "AZURE_OPENAI_ENDPOINT",
      "https://example.services.ai.azure.com/openai/v1/responses",
    );
    vi.stubEnv("AZURE_OPENAI_API_KEY", "test-key");
    vi.stubEnv("AZURE_OPENAI_DEPLOYMENT", "gpt-5-mini");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: JSON.stringify(semanticResult) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await evaluateSemanticWithProvider(
      "Elsa removed her glove and ran away.",
      1,
      "plot",
    );

    expect(result.source).toBe("azure-openai");
    expect(result.modelVersion).toBe("gpt-5-mini");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://example.services.ai.azure.com/openai/v1/responses",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("gpt-5-mini");
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
    expect(body.reasoning).toEqual({ effort: "minimal" });
    expect(body.store).toBe(false);
    expect(body.messages).toBeUndefined();
  });

  it("extracts output text from the Responses output array", async () => {
    vi.stubEnv(
      "AZURE_OPENAI_ENDPOINT",
      "https://example.services.ai.azure.com/openai/v1/responses/",
    );
    vi.stubEnv("AZURE_OPENAI_API_KEY", "test-key");
    vi.stubEnv("AZURE_OPENAI_DEPLOYMENT", "gpt-5-mini");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                { type: "output_text", text: JSON.stringify(semanticResult) },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await evaluateSemanticWithProvider(
      "Elsa removed her glove.",
      1,
      "plot",
    );

    expect(result.matchedFactIds).toEqual(["elsa_removed_glove"]);
  });
});
