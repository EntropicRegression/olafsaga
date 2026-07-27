import type { NodeConfig, NodeId, StudyThresholds } from "./types";

export const STUDY_CONFIG_VERSION = "prototype-2026-07-v1";
export const VOCABULARY_VERSION = "prototype-core-v1";

export const STUDY_THRESHOLDS: StudyThresholds = {
  minimumWordCount: 8,
  accuracy: 60,
  fluency: 60,
  emotionMinimumScore: 0.3,
  emotionMaximumRank: 2,
  maximumAttempts: 3,
  maximumRecordingSeconds: 30,
};

export const STUDY_NODES: Record<NodeId, NodeConfig> = {
  1: {
    id: 1,
    title: "The Coronation",
    sceneLabel: "Elsa's glove",
    factIds: ["elsa_removed_glove", "magic_changed_room"],
    factKeywords: [
      ["elsa", "glove"],
      ["magic", "ice", "snow", "ran", "run", "away"],
    ],
    targetEmotion: "surprised",
    emotionModelLabel: "surprised",
    plotPrompt:
      "What happened after Elsa removed her glove during the royal coronation, Anna?",
    feelingPrompt:
      "You remembered the moment beautifully; how did your heart feel then, Anna?",
    storySummary: "Elsa removed her glove, lost control of her magic, and ran away.",
    scaffolds: {
      plot: "Try starting: Elsa ran away",
      feeling: "Try starting: I felt surprised",
    },
  },
  2: {
    id: 2,
    title: "The Ice Palace",
    sceneLabel: "Elsa's magic",
    factIds: ["magic_hit_anna", "hair_turned_white"],
    factKeywords: [
      ["magic", "hit", "struck", "heart"],
      ["hair", "white"],
    ],
    targetEmotion: "scared",
    emotionModelLabel: "fearful",
    plotPrompt:
      "Elsa's magic reached you inside the ice palace; what happened next, Anna?",
    feelingPrompt:
      "That moment was very powerful; how did your heart feel inside, Anna?",
    storySummary: "Elsa's magic hit Anna, and Anna's hair began turning white.",
    scaffolds: {
      plot: "Try starting: Her magic hit",
      feeling: "Try starting: I felt scared",
    },
  },
  3: {
    id: 3,
    title: "The Trolls",
    sceneLabel: "True love",
    factIds: ["trolls_said_true_love", "love_can_thaw"],
    factKeywords: [
      ["troll", "trolls"],
      ["true", "love", "thaw", "melt", "heart"],
    ],
    targetEmotion: "worried",
    emotionModelLabel: "fearful",
    plotPrompt:
      "The friendly trolls knew special magic; what important words did they share?",
    feelingPrompt:
      "Their answer changed everything; how did those words make you feel, Anna?",
    storySummary: "The trolls said an act of true love could thaw Anna's heart.",
    scaffolds: {
      plot: "Try saying: True love helped",
      feeling: "Try saying: I felt worried",
    },
  },
  4: {
    id: 4,
    title: "Hans's Choice",
    sceneLabel: "Hans refused",
    factIds: ["hans_refused_kiss", "hans_left_anna"],
    factKeywords: [
      ["hans", "kiss", "love", "did", "not"],
      ["left", "locked", "alone", "help"],
    ],
    targetEmotion: "sad",
    emotionModelLabel: "sad",
    plotPrompt: "You hurried back to Hans for help; what did he do, Anna?",
    feelingPrompt:
      "That was such a sad moment; how did your heart feel afterward, Anna?",
    storySummary: "Hans refused to kiss Anna and left her alone in the cold.",
    scaffolds: {
      plot: "Try saying: Hans did not",
      feeling: "Try saying: I felt sad",
    },
  },
  5: {
    id: 5,
    title: "The Act of Love",
    sceneLabel: "Summer returns",
    factIds: ["anna_protected_elsa", "true_love_melted_ice"],
    factKeywords: [
      ["anna", "saved", "protected", "elsa", "froze", "frozen"],
      ["love", "melted", "thawed", "ice", "summer"],
    ],
    targetEmotion: "happy",
    emotionModelLabel: "happy",
    plotPrompt:
      "You ran through the storm to protect Elsa; what happened next, Anna?",
    feelingPrompt:
      "The ending brought summer back; how did your heart feel then, Anna?",
    storySummary: "Anna protected Elsa, and their true love melted the frozen magic.",
    scaffolds: {
      plot: "Try saying: The ice melted",
      feeling: "Try saying: I felt happy",
    },
  },
};

export function getNode(nodeId: NodeId): NodeConfig {
  return STUDY_NODES[nodeId];
}
