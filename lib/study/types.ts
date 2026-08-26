export type ExperimentGroup = "agent1" | "agent2";
export type RoundType = "plot" | "feeling";
export type NodeId = 1 | 2 | 3 | 4 | 5;

export type AttemptStatus =
  | "created"
  | "uploaded"
  | "analyzing"
  | "passed"
  | "failed"
  | "forced_advance"
  | "technical_error";

export type DecisionCode =
  | "PASS"
  | "CHINESE_OR_UNKNOWN"
  | "TOO_SHORT"
  | "OFF_TOPIC"
  | "GRAMMAR_UNCLEAR"
  | "LOW_ACCURACY"
  | "LOW_FLUENCY"
  | "LOW_EMOTION"
  | "TECHNICAL_ERROR";

export type MessageRole = "olaf" | "student" | "system";

export interface SpeechScores {
  accuracy: number | null;
  fluency: number | null;
  prosody: number | null;
  monotone: boolean;
  raw?: unknown;
}

export interface SemanticEvaluation {
  language: "en" | "zh" | "unknown";
  relevant: boolean;
  grammarUnderstandable: boolean;
  matchedFactIds: string[];
  hasObjectiveFact: boolean;
  hasFeelingExpression: boolean;
  contentComplete: boolean;
  decisionReason: string;
  source: "azure-openai" | "deterministic";
  modelVersion: string;
}

export interface EmotionScore {
  label: string;
  score: number;
}

export interface EmotionEvaluation {
  scores: EmotionScore[];
  targetLabel: string;
  targetRank: number | null;
  targetScore: number;
  passed: boolean;
  source: "emotion2vec" | "demo";
  modelVersion: string;
  inferenceMs?: number;
}

export interface AttemptInput {
  attemptId: string;
  sessionId: string;
  participantId: string;
  group: ExperimentGroup;
  nodeId: NodeId;
  round: RoundType;
  attemptNumber: number;
  transcript: string;
  durationMs: number;
  audioPath?: string;
  speechScores: SpeechScores;
  technicalError?: string;
}

export interface AttemptResult {
  status: AttemptStatus;
  decision: DecisionCode;
  wordCount: number;
  semantic: SemanticEvaluation | null;
  emotion: EmotionEvaluation | null;
  replyTemplateId: string;
  reply: string;
  toneHint?: string;
  forcedAdvance: boolean;
  nextNodeId: NodeId | null;
  nextRound: RoundType | null;
  worksheetReady: boolean;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  templateId?: string;
  nodeId: NodeId;
  round: RoundType;
  createdAt: string;
  toneHint?: string;
}

export interface WorksheetEntry {
  nodeId: NodeId;
  storySummary: string;
  emotionWord: string;
  sourceAttemptId?: string;
  status: "pending" | "ready" | "confirmed" | "assisted";
}

export interface StudySession {
  id: string;
  participantId: string;
  participantCode: string;
  group: ExperimentGroup;
  classId: string;
  nodeId: NodeId;
  round: RoundType;
  attemptNumber: number;
  status: "active" | "awaiting_confirmation" | "completed";
  awaitingWorksheetNodeId?: NodeId;
  configVersion: string;
  vocabularyVersion: string;
  thresholds: StudyThresholds;
  startedAt: string;
  updatedAt: string;
}

export interface Participant {
  id: string;
  code: string;
  classId: string;
  group: ExperimentGroup;
  role: "student" | "researcher";
  consentVersion: string;
  consentedAt: string;
}

export interface NodeConfig {
  id: NodeId;
  title: string;
  sceneLabel: string;
  factIds: string[];
  factKeywords: string[][];
  targetEmotion: string;
  emotionModelLabel: string;
  plotPrompt: string;
  feelingPrompt: string;
  storySummary: string;
  scaffolds: Record<RoundType, string>;
}

export interface StudyThresholds {
  minimumWordCount: number;
  accuracy: number;
  fluency: number;
  emotionMinimumScore: number;
  emotionMaximumRank: number;
  maximumAttempts: number;
  maximumRecordingSeconds: number;
}
