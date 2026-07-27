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
  const deployment = encodeURIComponent(process.env.AZURE_OPENAI_DEPLOYMENT!);
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION ?? "2025-04-01-preview";
  return `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
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
  const response = await fetch(endpointUrl(), {
    method: "POST",
    headers: {
      "api-key": process.env.AZURE_OPENAI_API_KEY!,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content:
            "You are a strict but fair research scorer for Taiwanese eighth-grade spoken English. Evaluate only; never continue the conversation. Minor grammar mistakes pass when the meaning is clear. Return the required JSON schema.",
        },
        {
          role: "user",
          content: JSON.stringify({
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
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "semantic_evaluation",
          strict: true,
          schema: {
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
          },
        },
      },
      max_completion_tokens: 500,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Azure OpenAI returned ${response.status}.`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Azure OpenAI returned an empty evaluation.");
  const parsed = semanticSchema.parse(JSON.parse(content));
  return {
    ...parsed,
    source: "azure-openai",
    modelVersion: process.env.AZURE_OPENAI_DEPLOYMENT!,
  };
}
