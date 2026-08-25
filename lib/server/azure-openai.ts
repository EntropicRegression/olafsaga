import "server-only";

import { z } from "zod";
import { getNode } from "@/lib/study/config";
import { deterministicSemanticEvaluation } from "@/lib/study/semantic";
import type {
  NodeId,
  RoundType,
  SemanticEvaluation,
} from "@/lib/study/types";

const semanticSchema = z.object({
  language: z.enum(["en", "zh", "unknown"]),
  relevant: z.boolean(),
  grammarUnderstandable: z.boolean(),
  matchedFactIds: z.array(z.string()),
  hasObjectiveFact: z.boolean(),
  hasFeelingExpression: z.boolean(),
  contentComplete: z.boolean(),
  decisionReason: z.string(),
});

export function isAzureOpenAIConfigured(): boolean {
  return Boolean(
    process.env.AZURE_OPENAI_ENDPOINT &&
      process.env.AZURE_OPENAI_API_KEY &&
      process.env.AZURE_OPENAI_DEPLOYMENT,
  );
}

function endpointUrl(): string {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!.replace(/\/$/, "");
  if (/\/openai\/v1\/responses$/i.test(endpoint)) return endpoint;

  const deployment = encodeURIComponent(process.env.AZURE_OPENAI_DEPLOYMENT!);
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION ?? "2025-04-01-preview";
  return `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
}

function isResponsesEndpoint(url: string): boolean {
  return /\/openai\/v1\/responses$/i.test(url);
}

function extractResponsesText(payload: {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string | undefined {
  if (payload.output_text?.trim()) return payload.output_text;

  for (const output of payload.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) {
        return content.text;
      }
    }
  }
  return undefined;
}

export async function evaluateSemanticWithProvider(
  transcript: string,
  nodeId: NodeId,
  round: RoundType,
): Promise<SemanticEvaluation> {
  if (!isAzureOpenAIConfigured()) {
    return deterministicSemanticEvaluation(transcript, nodeId, round);
  }

  const node = getNode(nodeId);
  const url = endpointUrl();
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      language: {
        type: "string",
        enum: ["en", "zh", "unknown"],
      },
      relevant: { type: "boolean" },
      grammarUnderstandable: { type: "boolean" },
      matchedFactIds: {
        type: "array",
        items: { type: "string", enum: node.factIds },
      },
      hasObjectiveFact: { type: "boolean" },
      hasFeelingExpression: { type: "boolean" },
      contentComplete: { type: "boolean" },
      decisionReason: { type: "string" },
    },
    required: [
      "language",
      "relevant",
      "grammarUnderstandable",
      "matchedFactIds",
      "hasObjectiveFact",
      "hasFeelingExpression",
      "contentComplete",
      "decisionReason",
    ],
  };
  const systemPrompt =
    "You are a strict but fair research scorer for Taiwanese eighth-grade spoken English. Evaluate only; never continue the conversation. Minor grammar mistakes pass when the meaning is clear. Return the required JSON schema.";
  const evaluationInput = JSON.stringify({
    transcript,
    round,
    node: {
      id: nodeId,
      storySummary: node.storySummary,
      acceptedFactIds: node.factIds,
      targetFeeling: node.targetEmotion,
    },
    rubric:
      round === "plot"
        ? "The response must state at least one required plot fact."
        : "The response must express Anna's own feeling using an understandable feeling word.",
  });
  const body = isResponsesEndpoint(url)
    ? {
        model: process.env.AZURE_OPENAI_DEPLOYMENT!,
        instructions: systemPrompt,
        input: evaluationInput,
        text: {
          format: {
            type: "json_schema",
            name: "semantic_evaluation",
            strict: true,
            schema,
          },
        },
        reasoning: { effort: "minimal" },
        store: false,
        max_output_tokens: 500,
      }
    : {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: evaluationInput },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "semantic_evaluation",
            strict: true,
            schema,
          },
        },
        max_completion_tokens: 500,
      };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "api-key": process.env.AZURE_OPENAI_API_KEY!,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Azure OpenAI returned ${response.status}.`);
  }
  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = isResponsesEndpoint(url)
    ? extractResponsesText(payload)
    : payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Azure OpenAI returned an empty evaluation.");
  const parsed = semanticSchema.parse(JSON.parse(content));
  return {
    ...parsed,
    source: "azure-openai",
    modelVersion: process.env.AZURE_OPENAI_DEPLOYMENT!,
  };
}
