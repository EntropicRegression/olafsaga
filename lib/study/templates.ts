import { getNode } from "./config";
import type {
  DecisionCode,
  ExperimentGroup,
  NodeId,
  RoundType,
} from "./types";

export interface ReplyTemplate {
  id: string;
  text: string;
  kind: "standard" | "scaffold" | "short";
  toneHint?: string;
}

const SHARED_TEMPLATES: Record<string, ReplyTemplate> = {
  welcome_sun: {
    id: "welcome_sun",
    text: "Anna, the bright summer sun is shining warmly over our kingdom again!",
    kind: "standard",
  },
  welcome_diary: {
    id: "welcome_diary",
    text: "This blank adventure diary is waiting for your wonderful memories today, Anna!",
    kind: "standard",
  },
  off_topic: {
    id: "off_topic",
    text: "That sounds interesting, Anna; can we look at this story moment together?",
    kind: "standard",
  },
  too_short: {
    id: "too_short",
    text: "I am really curious, Anna; what else happened during that important moment?",
    kind: "standard",
  },
  grammar_unclear: {
    id: "grammar_unclear",
    text: "I heard your brave voice, Anna; can we share that thought once more?",
    kind: "standard",
  },
  low_accuracy: {
    id: "low_accuracy",
    text: "Your idea is growing, Anna; can we try those English words once more?",
    kind: "standard",
  },
  low_fluency: {
    id: "low_fluency",
    text: "There is plenty of time, Anna; can our words flow gently together?",
    kind: "standard",
  },
  technical_error: {
    id: "technical_error",
    text: "Our snowflake signal slipped away; can we try the microphone again, Anna?",
    kind: "standard",
  },
  plot_pass_agent1: {
    id: "plot_pass_agent1",
    text: "Wonderful memory, Anna; your story details are clear and ready for our diary!",
    kind: "standard",
  },
  feeling_pass_agent1: {
    id: "feeling_pass_agent1",
    text: "Great work, Anna; your feeling words make this diary page complete and clear!",
    kind: "standard",
  },
  plot_pass_agent2: {
    id: "plot_pass_agent2",
    text: "Warm hugs, Anna; your brave voice made that story moment feel beautifully alive!",
    kind: "standard",
  },
  complete_agent1: {
    id: "complete_agent1",
    text: "Our adventure diary is complete, Anna; your English words grew beautifully today!",
    kind: "standard",
  },
  complete_agent2: {
    id: "complete_agent2",
    text: "Our adventure diary is complete, Anna; one giant warm hug is waiting!",
    kind: "standard",
  },
  forced_advance: {
    id: "forced_advance",
    text: "This page needs more practice, Anna; our diary can gently continue today!",
    kind: "standard",
  },
};

export function getOpeningMessages(): ReplyTemplate[] {
  return [
    SHARED_TEMPLATES.welcome_sun,
    SHARED_TEMPLATES.welcome_diary,
    {
      id: "node_1_plot_prompt",
      text: getNode(1).plotPrompt,
      kind: "standard",
    },
  ];
}

export function getPrompt(nodeId: NodeId, round: RoundType): ReplyTemplate {
  const node = getNode(nodeId);
  return {
    id: `node_${nodeId}_${round}_prompt`,
    text: round === "plot" ? node.plotPrompt : node.feelingPrompt,
    kind: "standard",
    toneHint:
      round === "feeling" ? `${node.targetEmotion} voice` : undefined,
  };
}

export function getScaffold(
  nodeId: NodeId,
  round: RoundType,
): ReplyTemplate {
  return {
    id: `node_${nodeId}_${round}_scaffold`,
    text: getNode(nodeId).scaffolds[round],
    kind: "scaffold",
  };
}

export function getDecisionReply(
  decision: DecisionCode,
  nodeId: NodeId,
  round: RoundType,
  attemptNumber: number,
  group: ExperimentGroup,
): ReplyTemplate {
  const node = getNode(nodeId);

  if (decision === "TECHNICAL_ERROR") {
    return SHARED_TEMPLATES.technical_error;
  }

  if (
    decision === "CHINESE_OR_UNKNOWN" ||
    (attemptNumber >= 2 && decision !== "LOW_EMOTION")
  ) {
    return getScaffold(nodeId, round);
  }

  if (decision === "OFF_TOPIC") return SHARED_TEMPLATES.off_topic;
  if (decision === "TOO_SHORT") return SHARED_TEMPLATES.too_short;
  if (decision === "GRAMMAR_UNCLEAR")
    return SHARED_TEMPLATES.grammar_unclear;
  if (decision === "LOW_ACCURACY") return SHARED_TEMPLATES.low_accuracy;
  if (decision === "LOW_FLUENCY") return SHARED_TEMPLATES.low_fluency;

  if (decision === "LOW_EMOTION") {
    return {
      id: `node_${nodeId}_emotion_retry`,
      text: `I am here, Anna; can your **${node.targetEmotion}** voice sparkle a little brighter?`,
      kind: "standard",
      toneHint: `${node.targetEmotion} voice`,
    };
  }

  if (round === "plot") {
    return group === "agent2"
      ? SHARED_TEMPLATES.plot_pass_agent2
      : SHARED_TEMPLATES.plot_pass_agent1;
  }

  if (group === "agent2") {
    return {
      id: `node_${nodeId}_feeling_pass_agent2`,
      text: `A warm hug, Anna; your **${node.targetEmotion}** voice makes this diary page shine!`,
      kind: "standard",
      toneHint: `${node.targetEmotion} voice`,
    };
  }

  return SHARED_TEMPLATES.feeling_pass_agent1;
}

export function getForcedAdvanceReply(): ReplyTemplate {
  return SHARED_TEMPLATES.forced_advance;
}

export function getCompletionReply(group: ExperimentGroup): ReplyTemplate {
  return group === "agent2"
    ? SHARED_TEMPLATES.complete_agent2
    : SHARED_TEMPLATES.complete_agent1;
}

export function allStaticTemplates(): ReplyTemplate[] {
  const nodeTemplates = (Object.keys([1, 2, 3, 4, 5]) as string[]).flatMap(
    (_, index) => {
      const nodeId = (index + 1) as NodeId;
      return [
        getPrompt(nodeId, "plot"),
        getPrompt(nodeId, "feeling"),
        getScaffold(nodeId, "plot"),
        getScaffold(nodeId, "feeling"),
        getDecisionReply("LOW_EMOTION", nodeId, "feeling", 1, "agent2"),
        getDecisionReply("PASS", nodeId, "feeling", 1, "agent2"),
      ];
    },
  );
  return [...Object.values(SHARED_TEMPLATES), ...nodeTemplates];
}
