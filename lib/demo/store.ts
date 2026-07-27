"use client";

import {
  STUDY_CONFIG_VERSION,
  VOCABULARY_VERSION,
  getNode,
} from "@/lib/study/config";
import { evaluateAttempt, makeDemoEmotionEvaluation } from "@/lib/study/evaluator";
import {
  getCompletionReply,
  getOpeningMessages,
  getPrompt,
} from "@/lib/study/templates";
import type {
  AttemptInput,
  AttemptResult,
  ChatMessage,
  ExperimentGroup,
  NodeId,
  StudySession,
  WorksheetEntry,
} from "@/lib/study/types";

export interface DemoAttemptRecord {
  input: AttemptInput;
  result: AttemptResult;
  createdAt: string;
}

export interface DemoStudyState {
  participantCode: string;
  session: StudySession;
  messages: ChatMessage[];
  worksheet: WorksheetEntry[];
  attempts: DemoAttemptRecord[];
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function messageFromTemplate(
  template: ReturnType<typeof getPrompt> | ReturnType<typeof getCompletionReply>,
  nodeId: NodeId,
  round: "plot" | "feeling",
): ChatMessage {
  return {
    id: makeId("message"),
    role: "olaf",
    text: template.text,
    templateId: template.id,
    nodeId,
    round,
    createdAt: new Date().toISOString(),
    toneHint: template.toneHint,
  };
}

export function demoGroupForCode(code: string): ExperimentGroup {
  const numeric = Number(code.match(/\d+/g)?.join("") ?? 1);
  return numeric % 2 === 0 ? "agent2" : "agent1";
}

export function createDemoState(code: string): DemoStudyState {
  const createdAt = new Date().toISOString();
  const group = demoGroupForCode(code);
  const session: StudySession = {
    id: makeId("session"),
    participantId: `demo-${code.toLowerCase()}`,
    participantCode: code,
    group,
    classId: "demo-class",
    nodeId: 1,
    round: "plot",
    attemptNumber: 1,
    status: "active",
    configVersion: STUDY_CONFIG_VERSION,
    vocabularyVersion: VOCABULARY_VERSION,
    startedAt: createdAt,
    updatedAt: createdAt,
  };
  return {
    participantCode: code,
    session,
    messages: getOpeningMessages().map((template) =>
      messageFromTemplate(template, 1, "plot"),
    ),
    worksheet: [1, 2, 3, 4, 5].map((nodeId) => ({
      nodeId: nodeId as NodeId,
      storySummary: "",
      emotionWord: "",
      status: "pending",
    })),
    attempts: [],
  };
}

function keyFor(code: string) {
  return `olaf-demo-study:${code.toLowerCase()}`;
}

export function loadDemoState(code: string): DemoStudyState {
  const raw = localStorage.getItem(keyFor(code));
  if (!raw) return createDemoState(code);
  try {
    return JSON.parse(raw) as DemoStudyState;
  } catch {
    return createDemoState(code);
  }
}

export function saveDemoState(state: DemoStudyState): void {
  localStorage.setItem(keyFor(state.participantCode), JSON.stringify(state));
}

export function resetDemoState(code: string): DemoStudyState {
  const state = createDemoState(code);
  saveDemoState(state);
  return state;
}

export function submitDemoAttempt(
  state: DemoStudyState,
  input: Omit<
    AttemptInput,
    | "attemptId"
    | "sessionId"
    | "participantId"
    | "group"
    | "nodeId"
    | "round"
    | "attemptNumber"
  >,
  emotionPassed = true,
): DemoStudyState {
  const attemptInput: AttemptInput = {
    ...input,
    attemptId: makeId("attempt"),
    sessionId: state.session.id,
    participantId: state.session.participantId,
    group: state.session.group,
    nodeId: state.session.nodeId,
    round: state.session.round,
    attemptNumber: state.session.attemptNumber,
  };
  const emotion =
    state.session.group === "agent2"
      ? makeDemoEmotionEvaluation(state.session.nodeId, emotionPassed)
      : null;
  const result = evaluateAttempt(attemptInput, { emotion });
  const timestamp = new Date().toISOString();
  const currentNode = state.session.nodeId;
  const currentRound = state.session.round;
  const studentMessage: ChatMessage = {
    id: makeId("message"),
    role: "student",
    text: attemptInput.transcript || "(No speech detected)",
    nodeId: currentNode,
    round: currentRound,
    createdAt: timestamp,
  };
  const olafMessage: ChatMessage = {
    id: makeId("message"),
    role: "olaf",
    text: result.reply,
    templateId: result.replyTemplateId,
    nodeId: currentNode,
    round: currentRound,
    toneHint: result.toneHint,
    createdAt: timestamp,
  };
  const next: DemoStudyState = {
    ...state,
    session: { ...state.session, updatedAt: timestamp },
    messages: [...state.messages, studentMessage, olafMessage],
    attempts: [
      ...state.attempts,
      { input: attemptInput, result, createdAt: timestamp },
    ],
  };

  if (result.status === "technical_error") return next;
  if (result.status === "failed") {
    next.session.attemptNumber += 1;
    return next;
  }
  if (currentRound === "plot") {
    next.session.round = "feeling";
    next.session.attemptNumber = 1;
    next.messages.push(
      messageFromTemplate(getPrompt(currentNode, "feeling"), currentNode, "feeling"),
    );
    return next;
  }

  next.session.status = "awaiting_confirmation";
  next.session.awaitingWorksheetNodeId = currentNode;
  next.session.attemptNumber = 1;
  if (result.nextNodeId) {
    next.session.nodeId = result.nextNodeId;
    next.session.round = result.nextRound!;
  }
  next.worksheet = next.worksheet.map((entry) =>
    entry.nodeId === currentNode
      ? {
          ...entry,
          storySummary: result.forcedAdvance
            ? ""
            : latestPassingPlotTranscript(next, currentNode),
          emotionWord: result.forcedAdvance
            ? ""
            : getNode(currentNode).targetEmotion,
          sourceAttemptId: attemptInput.attemptId,
          status: result.forcedAdvance ? "assisted" : "ready",
        }
      : entry,
  );
  return next;
}

function latestPassingPlotTranscript(
  state: DemoStudyState,
  nodeId: NodeId,
): string {
  return (
    [...state.attempts]
      .reverse()
      .find(
        (attempt) =>
          attempt.input.nodeId === nodeId &&
          attempt.input.round === "plot" &&
          attempt.result.status === "passed",
      )?.input.transcript ?? ""
  );
}

export function confirmDemoWorksheet(
  state: DemoStudyState,
): DemoStudyState {
  const nodeId = state.session.awaitingWorksheetNodeId;
  if (!nodeId) return state;
  const timestamp = new Date().toISOString();
  const completed = nodeId === 5;
  const next: DemoStudyState = {
    ...state,
    session: {
      ...state.session,
      status: completed ? "completed" : "active",
      awaitingWorksheetNodeId: undefined,
      updatedAt: timestamp,
    },
    worksheet: state.worksheet.map((entry) =>
      entry.nodeId === nodeId ? { ...entry, status: "confirmed" } : entry,
    ),
    messages: [...state.messages],
  };
  if (completed) {
    next.messages.push(
      messageFromTemplate(
        getCompletionReply(state.session.group),
        5,
        "feeling",
      ),
    );
  } else {
    next.messages.push(
      messageFromTemplate(
        getPrompt(next.session.nodeId, "plot"),
        next.session.nodeId,
        "plot",
      ),
    );
  }
  return next;
}

export function retryDemoWorksheet(state: DemoStudyState): DemoStudyState {
  const nodeId = state.session.awaitingWorksheetNodeId;
  if (!nodeId) return state;
  return {
    ...state,
    session: {
      ...state.session,
      nodeId,
      round: "feeling",
      attemptNumber: 1,
      status: "active",
      awaitingWorksheetNodeId: undefined,
      updatedAt: new Date().toISOString(),
    },
    worksheet: state.worksheet.map((entry) =>
      entry.nodeId === nodeId ? { ...entry, status: "pending" } : entry,
    ),
  };
}

const PASSING_SAMPLES: Record<NodeId, Record<"plot" | "feeling", string>> = {
  1: {
    plot: "Elsa removed her glove, lost control of her magic, and ran away.",
    feeling: "I felt very surprised and scared when ice filled the royal room.",
  },
  2: {
    plot: "Elsa's magic hit my heart, and my hair slowly turned white.",
    feeling: "I felt very scared because the cold magic was inside me.",
  },
  3: {
    plot: "The trolls said that true love could thaw my frozen heart.",
    feeling: "I felt worried, but their words also gave me some hope.",
  },
  4: {
    plot: "Hans did not kiss me, and he left me alone inside.",
    feeling: "I felt deeply sad because Hans did not truly love me.",
  },
  5: {
    plot: "I protected Elsa, froze solid, and our true love melted everything.",
    feeling: "I felt happy and safe when summer finally returned to us.",
  },
};

export function getDemoSample(
  nodeId: NodeId,
  round: "plot" | "feeling",
  kind: "pass" | "short" | "off-topic",
): string {
  if (kind === "short") return round === "plot" ? "Elsa ran away." : "I felt sad.";
  if (kind === "off-topic") {
    return "I ate noodles after school and played games with my friends.";
  }
  return PASSING_SAMPLES[nodeId][round];
}
