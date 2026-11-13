import { describe, expect, it } from "vitest";
import { evaluateAttempt } from "@/lib/study/evaluator";
import { getNode } from "@/lib/study/config";
import type {
  AttemptCompletion,
  AttemptInput,
  SemanticEvaluation,
} from "@/lib/study/types";
import type { Principal } from "@/lib/server/auth";
import type { CreatedAttempt } from "@/lib/server/repository";

/**
 * Flow tests for the student state machine. They run the real repository
 * functions against the Firestore emulator, so transactions, contention and
 * the documents the browser reloads from are the same as in production.
 *
 * Run with `npm run test:emulator`.
 */
const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

let sequence = 0;

function student(overrides: Partial<Principal> = {}): Principal {
  sequence += 1;
  return {
    uid: `flow-${Date.now()}-${sequence}`,
    code: `FLOW-${sequence}`,
    classId: "flow-class",
    role: "student",
    group: "agent1",
    consentVersion: "consent-flow-v1",
    demo: false,
    ...overrides,
  };
}

async function repository() {
  return import("@/lib/server/repository");
}

async function finalizeCreated(
  principal: Principal,
  created: CreatedAttempt,
  outcome: "pass" | "fail",
): Promise<AttemptCompletion> {
  const { finalizeAttempt } = await repository();
  const session = created.session;
  const passed = outcome === "pass";
  const input: AttemptInput = {
    attemptId: created.id,
    sessionId: session.id,
    participantId: principal.uid,
    group: session.group,
    nodeId: session.nodeId,
    round: session.round,
    attemptNumber: session.attemptNumber,
    transcript: passed
      ? "Elsa removed her glove and I felt very surprised then"
      : "I really like eating pizza with my friends every weekend",
    durationMs: 5_000,
    audioPath: created.storagePath,
    speechScores: { accuracy: 90, fluency: 90, prosody: 90, monotone: false },
  };
  const semantic: SemanticEvaluation = {
    language: "en",
    relevant: passed,
    grammarUnderstandable: true,
    matchedFactIds: passed ? [getNode(session.nodeId).factIds[0]] : [],
    hasObjectiveFact: passed,
    hasFeelingExpression: passed,
    contentComplete: passed,
    decisionReason: "flow test",
    source: "deterministic",
    modelVersion: "flow-test",
  };
  return finalizeAttempt(
    principal,
    input,
    evaluateAttempt(input, { semantic }, session.thresholds),
  );
}

async function submit(
  principal: Principal,
  sessionId: string,
  outcome: "pass" | "fail",
): Promise<AttemptCompletion> {
  const { createAttempt } = await repository();
  return finalizeCreated(
    principal,
    await createAttempt(principal, sessionId),
    outcome,
  );
}

/** Passes both rounds of the current Page and confirms its diary card. */
async function completePage(principal: Principal, sessionId: string) {
  const { confirmWorksheet } = await repository();
  await submit(principal, sessionId, "pass");
  const feeling = await submit(principal, sessionId, "pass");
  return confirmWorksheet(
    principal,
    sessionId,
    feeling.session.awaitingWorksheetNodeId!,
  );
}

describe.skipIf(!emulatorEnabled)("study session flow", () => {
  it("creates one session when requests start at the same time", { timeout: 60_000 }, async () => {
    const { getOrCreateSession } = await repository();
    const { adminDb } = await import("@/lib/firebase/admin");
    const principal = student();

    const sessions = await Promise.all([
      getOrCreateSession(principal),
      getOrCreateSession(principal),
      getOrCreateSession(principal),
    ]);

    expect(new Set(sessions.map((session) => session.id)).size).toBe(1);
    const stored = await adminDb()
      .collection("sessions")
      .where("participantId", "==", principal.uid)
      .get();
    expect(stored.size).toBe(1);
  });

  it("rejects an attempt that was created before the session moved on", async () => {
    const { createAttempt, getOrCreateSession, getSession } = await repository();
    const principal = student();
    const session = await getOrCreateSession(principal);
    const first = await createAttempt(principal, session.id);
    const second = await createAttempt(principal, session.id);

    await finalizeCreated(principal, first, "fail");
    await expect(finalizeCreated(principal, second, "fail")).rejects.toMatchObject({
      code: "ATTEMPT_STALE",
    });

    expect((await getSession(principal, session.id)).attemptNumber).toBe(2);
  });

  it("does not let a late attempt reopen a page that awaits confirmation", async () => {
    const { createAttempt, getOrCreateSession, getSession } = await repository();
    const principal = student();
    const session = await getOrCreateSession(principal);
    await submit(principal, session.id, "pass");
    const feeling = await createAttempt(principal, session.id);
    const late = await createAttempt(principal, session.id);

    await finalizeCreated(principal, feeling, "pass");
    await expect(finalizeCreated(principal, late, "pass")).rejects.toMatchObject({
      code: "ATTEMPT_STALE",
    });

    const current = await getSession(principal, session.id);
    expect(current.status).toBe("awaiting_confirmation");
    expect(current.awaitingWorksheetNodeId).toBe(1);
  });

  it("stores every prompt so a reload shows the current question", async () => {
    const { confirmWorksheet, getOrCreateSession, getSessionMessages } =
      await repository();
    const principal = student();
    const session = await getOrCreateSession(principal);

    await submit(principal, session.id, "pass");
    let messages = await getSessionMessages(principal, session.id);
    expect(messages.at(-1)?.templateId).toBe("node_1_feeling_prompt");

    await submit(principal, session.id, "pass");
    await confirmWorksheet(principal, session.id, 1);
    messages = await getSessionMessages(principal, session.id);
    expect(messages.at(-1)?.templateId).toBe("node_2_plot_prompt");
  });

  it("returns the finished diary instead of starting a new session", async () => {
    const { getOrCreateSession, getSessionMessages, getWorksheetEntries } =
      await repository();
    const { adminDb } = await import("@/lib/firebase/admin");
    const db = adminDb();
    const enrolled = student();
    const experimentId = `flow-experiment-${enrolled.uid}`;
    const principal: Principal = {
      ...enrolled,
      experimentId,
      enrollmentId: enrolled.uid,
    };
    await db.collection("experiments").doc(experimentId).set({
      status: "active",
      configVersion: "study-flow-v1",
      vocabularyVersion: "vocabulary-flow-v1",
    });
    await db
      .collection("experiments")
      .doc(experimentId)
      .collection("enrollments")
      .doc(enrolled.uid)
      .set({
        participantId: enrolled.uid,
        participantCode: enrolled.code,
        classId: enrolled.classId,
        group: "agent1",
        status: "issued",
      });

    const session = await getOrCreateSession(principal);
    let current = session;
    for (let page = 1; page <= 5; page += 1) {
      current = await completePage(principal, session.id);
    }
    expect(current.status).toBe("completed");

    // Completion clears the active enrollment pointers, so the next request
    // arrives without an experiment, exactly as requirePrincipal builds it.
    const afterCompletion = await getOrCreateSession(enrolled);
    expect(afterCompletion.id).toBe(session.id);
    expect(afterCompletion.status).toBe("completed");

    const messages = await getSessionMessages(enrolled, afterCompletion.id);
    expect(messages.at(-1)?.templateId).toBe("complete_agent1");
    expect(await getWorksheetEntries(enrolled, afterCompletion.id)).toHaveLength(5);
    const stored = await db
      .collection("sessions")
      .where("participantId", "==", enrolled.uid)
      .get();
    expect(stored.size).toBe(1);
  });

  it("shows each page once after two study restarts", async () => {
    const { getOrCreateSession, getSessionMessages } = await repository();
    const principal = student();
    const first = await getOrCreateSession(principal);

    // Page 1 plot exhausts its attempts: restart into a second session.
    await submit(principal, first.id, "fail");
    await submit(principal, first.id, "fail");
    const firstRestart = await submit(principal, first.id, "fail");
    const second = firstRestart.session;
    expect(firstRestart.restart?.trigger.nodeId).toBe(1);

    // The second session finishes Page 1, then exhausts Page 2.
    await completePage(principal, second.id);
    await submit(principal, second.id, "fail");
    await submit(principal, second.id, "fail");
    const secondRestart = await submit(principal, second.id, "fail");
    const third = secondRestart.session;
    expect(secondRestart.restart?.trigger.nodeId).toBe(2);

    const messages = await getSessionMessages(principal, third.id);
    const pageOneStudentTurns = messages.filter(
      (message) => message.nodeId === 1 && message.role === "student",
    );
    // Only the passing plot and feeling turns of the second session remain;
    // the first session's failed Page 1 turns were replaced by the restart.
    expect(pageOneStudentTurns).toHaveLength(2);
    expect(
      messages.filter(
        (message) => message.nodeId === 2 && message.role === "student",
      ),
    ).toHaveLength(0);
  });
});
