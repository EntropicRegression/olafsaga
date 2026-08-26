import { getNode, STUDY_THRESHOLDS } from "./config";
import { deterministicSemanticEvaluation } from "./semantic";
import {
  containsChinese,
  countEnglishWords,
  isUnknownResponse,
} from "./text";
import {
  getDecisionReply,
  getForcedAdvanceReply,
} from "./templates";
import type {
  AttemptInput,
  AttemptResult,
  DecisionCode,
  EmotionEvaluation,
  NodeId,
  RoundType,
  SemanticEvaluation,
  StudyThresholds,
} from "./types";

export interface ProviderEvaluations {
  semantic?: SemanticEvaluation;
  emotion?: EmotionEvaluation | null;
}

export function getNextStep(
  nodeId: NodeId,
  round: RoundType,
): {
  nextNodeId: NodeId | null;
  nextRound: RoundType | null;
  worksheetReady: boolean;
} {
  if (round === "plot") {
    return {
      nextNodeId: nodeId,
      nextRound: "feeling",
      worksheetReady: false,
    };
  }
  if (nodeId === 5) {
    return {
      nextNodeId: null,
      nextRound: null,
      worksheetReady: true,
    };
  }
  return {
    nextNodeId: (nodeId + 1) as NodeId,
    nextRound: "plot",
    worksheetReady: true,
  };
}

function determineDecision(
  input: AttemptInput,
  semantic: SemanticEvaluation,
  emotion: EmotionEvaluation | null,
  wordCount: number,
  thresholds: StudyThresholds,
): DecisionCode {
  if (input.technicalError) return "TECHNICAL_ERROR";
  if (
    semantic.language !== "en" ||
    containsChinese(input.transcript) ||
    isUnknownResponse(input.transcript)
  ) {
    return "CHINESE_OR_UNKNOWN";
  }
  if (!semantic.grammarUnderstandable) return "GRAMMAR_UNCLEAR";
  if (!semantic.relevant || !semantic.contentComplete) return "OFF_TOPIC";
  if (wordCount < thresholds.minimumWordCount) return "TOO_SHORT";

  if (
    input.speechScores.accuracy !== null &&
    input.speechScores.accuracy < thresholds.accuracy
  ) {
    return "LOW_ACCURACY";
  }
  if (
    input.speechScores.fluency !== null &&
    input.speechScores.fluency < thresholds.fluency
  ) {
    return "LOW_FLUENCY";
  }

  if (
    input.group === "agent2" &&
    (input.speechScores.monotone || !emotion?.passed)
  ) {
    return "LOW_EMOTION";
  }

  return "PASS";
}

export function evaluateAttempt(
  input: AttemptInput,
  providers: ProviderEvaluations = {},
  thresholds: StudyThresholds = STUDY_THRESHOLDS,
): AttemptResult {
  const wordCount = countEnglishWords(input.transcript);
  const semantic =
    providers.semantic ??
    deterministicSemanticEvaluation(input.transcript, input.nodeId, input.round);
  const emotion =
    input.group === "agent2" ? (providers.emotion ?? null) : null;
  const decision = determineDecision(
    input,
    semantic,
    emotion,
    wordCount,
    thresholds,
  );
  const isTechnical = decision === "TECHNICAL_ERROR";
  const shouldForceAdvance =
    !isTechnical &&
    decision !== "PASS" &&
    input.attemptNumber >= thresholds.maximumAttempts;
  const progression =
    decision === "PASS" || shouldForceAdvance
      ? getNextStep(input.nodeId, input.round)
      : {
          nextNodeId: input.nodeId,
          nextRound: input.round,
          worksheetReady: false,
        };
  const reply = shouldForceAdvance
    ? getForcedAdvanceReply()
    : getDecisionReply(
        decision,
        input.nodeId,
        input.round,
        input.attemptNumber,
        input.group,
      );

  return {
    status: isTechnical
      ? "technical_error"
      : shouldForceAdvance
        ? "forced_advance"
        : decision === "PASS"
          ? "passed"
          : "failed",
    decision,
    wordCount,
    semantic: isTechnical ? null : semantic,
    emotion,
    replyTemplateId: reply.id,
    reply: reply.text,
    ...(reply.toneHint ? { toneHint: reply.toneHint } : {}),
    forcedAdvance: shouldForceAdvance,
    ...progression,
  };
}

export function makeDemoEmotionEvaluation(
  nodeId: NodeId,
  passed = true,
): EmotionEvaluation {
  const target = getNode(nodeId).emotionModelLabel;
  const other = target === "neutral" ? "happy" : "neutral";
  return {
    scores: passed
      ? [
          { label: target, score: 0.62 },
          { label: other, score: 0.2 },
        ]
      : [
          { label: "neutral", score: 0.74 },
          { label: target, score: 0.12 },
        ],
    targetLabel: target,
    targetRank: passed ? 1 : 2,
    targetScore: passed ? 0.62 : 0.12,
    passed,
    source: "demo",
    modelVersion: "demo-emotion-v1",
    inferenceMs: 180,
  };
}
