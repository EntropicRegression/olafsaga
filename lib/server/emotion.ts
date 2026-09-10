import "server-only";

import { z } from "zod";
import { getNode, STUDY_THRESHOLDS } from "@/lib/study/config";
import type {
  EmotionEvaluation,
  NodeId,
  StudyThresholds,
} from "@/lib/study/types";
import { getGoogleAuth } from "./google-auth";

const responseSchema = z.object({
  scores: z.array(
    z.object({
      label: z.string(),
      score: z.number(),
    }),
  ),
  modelVersion: z.string().default("emotion2vec-plus-base"),
  inferenceMs: z.number().optional(),
});

export function isEmotionServiceConfigured(): boolean {
  return Boolean(process.env.EMOTION_SERVICE_URL);
}

async function authorizationHeader(url: string): Promise<string | undefined> {
  if (process.env.EMOTION_SERVICE_TOKEN) {
    return `Bearer ${process.env.EMOTION_SERVICE_TOKEN}`;
  }
  try {
    const auth = getGoogleAuth();
    const client = await auth.getIdTokenClient(url);
    const headers = await client.getRequestHeaders();
    return headers.get("authorization") ?? undefined;
  } catch {
    return undefined;
  }
}

export async function evaluateEmotionWithProvider(
  storagePath: string,
  nodeId: NodeId,
  thresholds: StudyThresholds = STUDY_THRESHOLDS,
): Promise<EmotionEvaluation> {
  const baseUrl = process.env.EMOTION_SERVICE_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("The emotion2vec service is not configured.");
  const url = `${baseUrl}/v1/analyze`;
  const authorization = await authorizationHeader(baseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify({
      bucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      objectPath: storagePath,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`emotion2vec returned ${response.status}.`);
  }
  const parsed = responseSchema.parse(await response.json());
  const sorted = [...parsed.scores].sort((a, b) => b.score - a.score);
  const targetLabel = getNode(nodeId).emotionModelLabel;
  const targetIndex = sorted.findIndex((score) => score.label === targetLabel);
  const targetRank = targetIndex >= 0 ? targetIndex + 1 : null;
  const targetScore = targetIndex >= 0 ? sorted[targetIndex].score : 0;
  const passed =
    targetRank !== null &&
    targetRank <= thresholds.emotionMaximumRank &&
    targetScore >= thresholds.emotionMinimumScore;

  return {
    scores: sorted,
    targetLabel,
    targetRank,
    targetScore,
    passed,
    source: "emotion2vec",
    modelVersion: parsed.modelVersion,
    inferenceMs: parsed.inferenceMs,
  };
}
