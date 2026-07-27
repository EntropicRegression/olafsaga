import { getNode } from "./config";
import {
  containsChinese,
  getEnglishWords,
  isUnknownResponse,
  normalizeTranscript,
} from "./text";
import type {
  NodeId,
  RoundType,
  SemanticEvaluation,
} from "./types";

const FEELING_WORDS = new Set([
  "afraid",
  "angry",
  "brave",
  "calm",
  "confused",
  "excited",
  "fearful",
  "glad",
  "happy",
  "hurt",
  "nervous",
  "sad",
  "scared",
  "shocked",
  "surprised",
  "upset",
  "worried",
]);

function keywordMatches(transcript: string, words: string[]): boolean {
  return words.some((word) =>
    new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
      transcript,
    ),
  );
}

export function deterministicSemanticEvaluation(
  transcript: string,
  nodeId: NodeId,
  round: RoundType,
): SemanticEvaluation {
  const normalized = normalizeTranscript(transcript);
  const words = getEnglishWords(normalized).map((word) => word.toLowerCase());
  const node = getNode(nodeId);

  if (containsChinese(normalized)) {
    return {
      language: "zh",
      relevant: false,
      grammarUnderstandable: false,
      matchedFactIds: [],
      hasObjectiveFact: false,
      hasFeelingExpression: false,
      contentComplete: false,
      decisionReason: "Chinese speech was detected.",
      source: "deterministic",
      modelVersion: "keyword-v1",
    };
  }

  if (isUnknownResponse(normalized)) {
    return {
      language: normalized ? "en" : "unknown",
      relevant: false,
      grammarUnderstandable: false,
      matchedFactIds: [],
      hasObjectiveFact: false,
      hasFeelingExpression: false,
      contentComplete: false,
      decisionReason: "The response was empty or explicitly unknown.",
      source: "deterministic",
      modelVersion: "keyword-v1",
    };
  }

  const matchedFactIds = node.factKeywords.flatMap((keywordGroup, index) =>
    keywordGroup.some((keyword) => keywordMatches(normalized, [keyword]))
      ? [node.factIds[index]]
      : [],
  );
  const hasObjectiveFact = matchedFactIds.length > 0;
  const hasFeelingExpression = words.some((word) => FEELING_WORDS.has(word));
  const grammarUnderstandable =
    words.length >= 3 &&
    (/\b(i|elsa|anna|hans|they|trolls?|magic|love|she|he|it)\b/i.test(
      normalized,
    ) ||
      hasFeelingExpression);
  const relevant =
    round === "plot" ? hasObjectiveFact : hasFeelingExpression;
  const contentComplete =
    round === "plot" ? hasObjectiveFact : hasFeelingExpression;

  return {
    language: "en",
    relevant,
    grammarUnderstandable,
    matchedFactIds,
    hasObjectiveFact,
    hasFeelingExpression,
    contentComplete,
    decisionReason: relevant
      ? "The response matches the current study rubric."
      : "The response does not match the current plot or feeling rubric.",
    source: "deterministic",
    modelVersion: "keyword-v1",
  };
}
