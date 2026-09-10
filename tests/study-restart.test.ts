import { describe, expect, it } from "vitest";
import { createStudyRestart } from "@/lib/study/restart";
import { STUDY_THRESHOLDS } from "@/lib/study/config";
import type { AttemptInput, StudySession } from "@/lib/study/types";
import { createDemoState, submitDemoAttempt } from "@/lib/demo/store";

const session: StudySession = {
  id: "session-old",
  participantId: "participant-1",
  participantCode: "P-001",
  classId: "class-1",
  group: "agent2",
  nodeId: 3,
  round: "feeling",
  attemptNumber: 3,
  status: "active",
  configVersion: "config-1",
  vocabularyVersion: "vocabulary-1",
  thresholds: STUDY_THRESHOLDS,
  startedAt: "2026-09-10T09:00:00.000Z",
  updatedAt: "2026-09-10T09:05:00.000Z",
};

const attempt: AttemptInput = {
  attemptId: "attempt-3",
  sessionId: session.id,
  participantId: session.participantId,
  group: session.group,
  nodeId: session.nodeId,
  round: session.round,
  attemptNumber: session.attemptNumber,
  transcript: "I felt surprised.",
  durationMs: 3000,
  speechScores: {
    accuracy: 70,
    fluency: 70,
    prosody: 70,
    monotone: false,
  },
};

describe("study restart", () => {
  it("preserves the old session and restarts the current page at plot", () => {
    const timestamp = "2026-09-10T09:10:00.000Z";
    const plan = createStudyRestart(
      session,
      attempt,
      { sessionId: "session-new", restartId: "restart-1" },
      timestamp,
    );

    expect(session.status).toBe("active");
    expect(plan.previousSession).toMatchObject({
      id: "session-old",
      status: "restarted",
      restartedAsSessionId: "session-new",
      restartTrigger: {
        attemptId: "attempt-3",
        nodeId: 3,
        round: "feeling",
        attemptNumber: 3,
      },
    });
    expect(plan.nextSession).toMatchObject({
      id: "session-new",
      nodeId: 3,
      round: "plot",
      attemptNumber: 1,
      status: "active",
      rootSessionId: "session-old",
      restartIndex: 1,
      restartedFromSessionId: "session-old",
    });
    expect(plan.nextSession.awaitingWorksheetNodeId).toBeUndefined();
    expect(plan.restart).toMatchObject({
      id: "restart-1",
      rootSessionId: "session-old",
      fromSessionId: "session-old",
      toSessionId: "session-new",
      restartIndex: 1,
      trigger: {
        nodeId: 3,
        round: "feeling",
        attemptNumber: 3,
        reason: "forced_advance",
      },
    });
  });

  it("keeps the root session and increments the restart number", () => {
    const secondRun: StudySession = {
      ...session,
      id: "session-second",
      rootSessionId: "session-old",
      restartIndex: 1,
      restartedFromSessionId: "session-old",
    };
    const plan = createStudyRestart(
      secondRun,
      { ...attempt, sessionId: secondRun.id },
      { sessionId: "session-third", restartId: "restart-2" },
      "2026-09-10T09:20:00.000Z",
    );

    expect(plan.nextSession.rootSessionId).toBe("session-old");
    expect(plan.nextSession.restartIndex).toBe(2);
    expect(plan.restart.restartIndex).toBe(2);
  });

  it("clears only the current demo page while retaining earlier pages and audit", () => {
    const current = createDemoState("P-002");
    current.session.nodeId = 3;
    current.session.round = "feeling";
    current.messages.push({
      id: "old-message",
      role: "student",
      text: "Earlier page answer",
      nodeId: 1,
      round: "plot",
      createdAt: new Date().toISOString(),
    });
    current.messages.push({
      id: "current-page-message",
      role: "student",
      text: "Current page answer",
      nodeId: 3,
      round: "plot",
      createdAt: new Date().toISOString(),
    });
    current.worksheet[0] = {
      nodeId: 1,
      storySummary: "Earlier worksheet entry",
      emotionWord: "surprised",
      status: "confirmed",
    };
    current.session.thresholds = {
      ...current.session.thresholds,
      maximumAttempts: 1,
    };

    const next = submitDemoAttempt(current, {
      transcript: "I want to talk about pizza and games after school today.",
      durationMs: 2000,
      speechScores: {
        accuracy: 80,
        fluency: 80,
        prosody: 80,
        monotone: false,
      },
    });

    expect(next.session.id).not.toBe(current.session.id);
    expect(next.session).toMatchObject({
      nodeId: 3,
      round: "plot",
      attemptNumber: 1,
      restartIndex: 1,
    });
    expect(next.messages.some((item) => item.text === "Earlier page answer")).toBe(
      true,
    );
    expect(next.messages.some((item) => item.nodeId === 3 && item.role === "student")).toBe(
      false,
    );
    expect(next.messages.at(-2)).toMatchObject({
      templateId: "forced_advance",
      nodeId: 3,
      round: "feeling",
    });
    expect(next.messages.at(-1)).toMatchObject({
      templateId: "node_3_plot_prompt",
      nodeId: 3,
      round: "plot",
    });
    expect(next.worksheet[0]).toMatchObject({
      storySummary: "Earlier worksheet entry",
      status: "confirmed",
    });
    expect(next.worksheet[2]).toMatchObject({
      storySummary: "",
      emotionWord: "",
      status: "pending",
    });
    expect(next.attempts).toHaveLength(1);
    expect(next.restarts[0]).toMatchObject({
      fromSessionId: current.session.id,
      toSessionId: next.session.id,
      restartIndex: 1,
      trigger: { nodeId: 3, round: "feeling", attemptNumber: 1 },
    });
  });
});
