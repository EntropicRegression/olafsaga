import "server-only";

import { randomInt } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminBucket, adminDb } from "@/lib/firebase/admin";
import { withoutUndefinedProperties } from "@/lib/server/firestore-data";
import {
  getNode,
  resolveStudyThresholds,
} from "@/lib/study/config";
import { getOpeningMessages } from "@/lib/study/templates";
import { createStudyRestart } from "@/lib/study/restart";
import type {
  AttemptCompletion,
  AttemptInput,
  AttemptResult,
  ExperimentGroup,
  NodeId,
  RoundType,
  StudyRestart,
  StudyRestartTrigger,
  StudySession,
} from "@/lib/study/types";
import type { Principal } from "./auth";
import { AuthError } from "./auth";
import { getActiveStudyConfig } from "./study-config";
import {
  normalizeTechnicalDetail,
  type TechnicalFailure,
} from "@/lib/study/technical-failure";

const now = () => new Date().toISOString();

function shuffledBlock(size: 4 | 6): ExperimentGroup[] {
  const values: ExperimentGroup[] = [
    ...Array.from({ length: size / 2 }, () => "agent1" as const),
    ...Array.from({ length: size / 2 }, () => "agent2" as const),
  ];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapWith = randomInt(index + 1);
    [values[index], values[swapWith]] = [values[swapWith], values[index]];
  }
  return values;
}

function toSession(id: string, data: FirebaseFirestore.DocumentData): StudySession {
  return {
    id,
    participantId: String(data.participantId),
    participantCode: String(data.participantCode),
    group: data.group as ExperimentGroup,
    classId: String(data.classId),
    nodeId: Number(data.nodeId) as NodeId,
    round: data.round as RoundType,
    attemptNumber: Number(data.attemptNumber),
    status: data.status,
    awaitingWorksheetNodeId: data.awaitingWorksheetNodeId
      ? (Number(data.awaitingWorksheetNodeId) as NodeId)
      : undefined,
    rootSessionId: data.rootSessionId ? String(data.rootSessionId) : undefined,
    restartIndex:
      data.restartIndex === undefined ? undefined : Number(data.restartIndex),
    restartedFromSessionId: data.restartedFromSessionId
      ? String(data.restartedFromSessionId)
      : undefined,
    restartedAt: data.restartedAt ? String(data.restartedAt) : undefined,
    restartedAsSessionId: data.restartedAsSessionId
      ? String(data.restartedAsSessionId)
      : undefined,
    restartTrigger: data.restartTrigger as StudyRestartTrigger | undefined,
    configVersion: String(data.configVersion),
    vocabularyVersion: String(data.vocabularyVersion),
    thresholds: resolveStudyThresholds(data.thresholds),
    startedAt: String(data.startedAt),
    updatedAt: String(data.updatedAt),
  };
}

async function assignGroup(principal: Principal): Promise<ExperimentGroup> {
  if (principal.group) return principal.group;
  const db = adminDb();
  const participantRef = db.collection("participants").doc(principal.uid);
  const classRef = db.collection("classes").doc(principal.classId);

  return db.runTransaction(async (transaction) => {
    const [participantSnap, classSnap] = await Promise.all([
      transaction.get(participantRef),
      transaction.get(classRef),
    ]);
    const existing = participantSnap.data()?.group;
    if (existing === "agent1" || existing === "agent2") return existing;

    const allocationQueue = Array.isArray(classSnap.data()?.allocationQueue)
      ? ([...classSnap.data()!.allocationQueue] as ExperimentGroup[])
      : [];
    const queue =
      allocationQueue.length > 0
        ? allocationQueue
        : shuffledBlock(randomInt(2) === 0 ? 4 : 6);
    const group = queue.shift()!;

    transaction.set(
      classRef,
      {
        allocationQueue: queue,
        allocatedCount: FieldValue.increment(1),
        updatedAt: now(),
      },
      { merge: true },
    );
    transaction.set(
      participantRef,
      {
        group,
        groupAssignedAt: now(),
        groupAssignmentMethod: "permuted-block-4-6",
      },
      { merge: true },
    );
    transaction.set(db.collection("auditLogs").doc(), {
      action: "participant.group_assigned",
      participantId: principal.uid,
      classId: principal.classId,
      group,
      createdAt: now(),
    });
    return group;
  });
}

export async function getOrCreateSession(
  principal: Principal,
): Promise<StudySession> {
  if (!principal.consentVersion) {
    throw new AuthError("Research consent is required.", 403);
  }
  const group = await assignGroup(principal);
  const activeConfig = await getActiveStudyConfig();
  const db = adminDb();
  const participantRef = db.collection("participants").doc(principal.uid);

  const participantSnap = await participantRef.get();
  const activeSessionId = participantSnap.data()?.activeSessionId as
    | string
    | undefined;
  if (activeSessionId) {
    const existing = await db.collection("sessions").doc(activeSessionId).get();
    if (
      existing.exists &&
      ["active", "awaiting_confirmation"].includes(
        String(existing.data()?.status),
      )
    ) {
      return toSession(existing.id, existing.data()!);
    }
  }

  const sessionRef = db.collection("sessions").doc();
  const startedAt = now();
  const session: StudySession = {
    id: sessionRef.id,
    participantId: principal.uid,
    participantCode: principal.code,
    group,
    classId: principal.classId,
    nodeId: 1,
    round: "plot",
    attemptNumber: 1,
    status: "active",
    rootSessionId: sessionRef.id,
    restartIndex: 0,
    configVersion: activeConfig.configVersion,
    vocabularyVersion: activeConfig.vocabularyVersion,
    thresholds: activeConfig.thresholds,
    startedAt,
    updatedAt: startedAt,
  };

  const batch = db.batch();
  batch.set(sessionRef, session);
  batch.set(
    participantRef,
    { activeSessionId: session.id, lastActiveAt: startedAt },
    { merge: true },
  );
  getOpeningMessages().forEach((message, sequence) => {
    batch.set(sessionRef.collection("messages").doc(), {
      role: "olaf",
      text: message.text,
      templateId: message.id,
      nodeId: 1,
      round: "plot",
      sequence,
      createdAt: startedAt,
    });
  });
  await batch.commit();
  return session;
}

export interface CreatedAttempt {
  id: string;
  storagePath: string;
  session: StudySession;
}

export interface AttemptDocument extends Record<string, unknown> {
  ref: FirebaseFirestore.DocumentReference;
  id: string;
}

export async function createAttempt(
  principal: Principal,
  sessionId: string,
): Promise<CreatedAttempt> {
  const db = adminDb();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new AuthError("Session was not found.", 404);
  const session = toSession(sessionSnap.id, sessionSnap.data()!);
  if (session.participantId !== principal.uid) {
    throw new AuthError("This session belongs to another participant.", 403);
  }
  if (session.status !== "active") {
    throw new AuthError("The worksheet must be confirmed before recording.", 409);
  }

  const attemptRef = sessionRef.collection("attempts").doc();
  const storagePath = `audio/${principal.uid}/${sessionId}/${session.nodeId}-${session.round}-${attemptRef.id}.wav`;
  await attemptRef.set({
    participantId: principal.uid,
    participantCode: principal.code,
    classId: session.classId,
    group: session.group,
    nodeId: session.nodeId,
    round: session.round,
    attemptNumber: session.attemptNumber,
    status: "created",
    storagePath,
    configVersion: session.configVersion,
    vocabularyVersion: session.vocabularyVersion,
    thresholds: session.thresholds,
    createdAt: now(),
    updatedAt: now(),
  });

  return { id: attemptRef.id, storagePath, session };
}

export async function getAttempt(
  principal: Principal,
  sessionId: string,
  attemptId: string,
): Promise<AttemptDocument> {
  const ref = adminDb()
    .collection("sessions")
    .doc(sessionId)
    .collection("attempts")
    .doc(attemptId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new AuthError("Attempt was not found.", 404);
  if (
    snapshot.data()?.participantId !== principal.uid &&
    principal.role !== "researcher"
  ) {
    throw new AuthError("This attempt belongs to another participant.", 403);
  }
  return {
    ref,
    id: snapshot.id,
    ...(snapshot.data() as Record<string, unknown>),
  };
}

export async function getSession(
  principal: Principal,
  sessionId: string,
): Promise<StudySession> {
  const snapshot = await adminDb().collection("sessions").doc(sessionId).get();
  if (!snapshot.exists) throw new AuthError("Session was not found.", 404);
  if (
    snapshot.data()?.participantId !== principal.uid &&
    principal.role !== "researcher"
  ) {
    throw new AuthError("This session belongs to another participant.", 403);
  }
  return toSession(snapshot.id, snapshot.data()!);
}

export async function getAttemptCompletion(
  principal: Principal,
  sessionId: string,
  attempt: Record<string, unknown>,
): Promise<AttemptCompletion> {
  const restartedAsSessionId =
    typeof attempt.restartedAsSessionId === "string"
      ? attempt.restartedAsSessionId
      : undefined;
  const session = await getSession(
    principal,
    restartedAsSessionId ?? sessionId,
  );
  const restart =
    attempt.restart && typeof attempt.restart === "object"
      ? (attempt.restart as StudyRestart)
      : undefined;
  return { session, ...(restart ? { restart } : {}) };
}

export async function assertAudioUploaded(path: string): Promise<void> {
  if (!path.startsWith("audio/") || path.includes("..")) {
    throw new AuthError("The WAV path is invalid.", 400);
  }
  const file = adminBucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new AuthError("The WAV upload is not complete.", 409);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);
  if (
    metadata.contentType !== "audio/wav" ||
    size <= 44 ||
    size > 2 * 1024 * 1024
  ) {
    throw new AuthError("The uploaded file is not a valid study WAV.", 415);
  }
}

export async function markAttemptAnalyzing(
  sessionId: string,
  attemptId: string,
  input: AttemptInput,
): Promise<void> {
  await adminDb()
    .collection("sessions")
    .doc(sessionId)
    .collection("attempts")
    .doc(attemptId)
    .set(
      {
        status: "analyzing",
        transcript: input.transcript,
        durationMs: input.durationMs,
        speechScores: input.speechScores,
        technicalError: FieldValue.delete(),
        technicalErrorCode: FieldValue.delete(),
        technicalFailure: FieldValue.delete(),
        updatedAt: now(),
      },
      { merge: true },
    );
}

export async function markAttemptTechnicalFailure(
  sessionId: string,
  attemptId: string,
  input: AttemptInput,
  failure: TechnicalFailure,
  technicalDetail: unknown,
): Promise<void> {
  await adminDb()
    .collection("sessions")
    .doc(sessionId)
    .collection("attempts")
    .doc(attemptId)
    .set(
      {
        status: "technical_error",
        transcript: input.transcript,
        durationMs: input.durationMs,
        speechScores: input.speechScores,
        technicalError: normalizeTechnicalDetail(technicalDetail),
        technicalErrorCode: failure.code,
        technicalFailure: failure,
        updatedAt: now(),
      },
      { merge: true },
    );
}

export async function finalizeAttempt(
  principal: Principal,
  input: AttemptInput,
  result: AttemptResult,
): Promise<AttemptCompletion> {
  const db = adminDb();
  const sessionRef = db.collection("sessions").doc(input.sessionId);
  const attemptRef = sessionRef.collection("attempts").doc(input.attemptId);
  const nextSessionRef = db.collection("sessions").doc();
  const restartRef = db.collection("studyRestarts").doc();
  const timestamp = now();

  return db.runTransaction(async (transaction) => {
    const [sessionSnap, attemptSnap] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(attemptRef),
    ]);
    if (!sessionSnap.exists || !attemptSnap.exists) {
      throw new AuthError("Session or attempt was not found.", 404);
    }
    if (sessionSnap.data()?.participantId !== principal.uid) {
      throw new AuthError("This session belongs to another participant.", 403);
    }

    const existingStatus = attemptSnap.data()?.status;
    if (
      existingStatus === "passed" ||
      existingStatus === "failed" ||
      existingStatus === "forced_advance" ||
      (existingStatus === "technical_error" &&
        attemptSnap.data()?.technicalFailure?.retryable !== true)
    ) {
      const existingAttempt = attemptSnap.data()!;
      const restartedAsSessionId = existingAttempt.restartedAsSessionId;
      if (
        existingStatus === "forced_advance" &&
        typeof restartedAsSessionId === "string"
      ) {
        const nextSessionSnap = await transaction.get(
          db.collection("sessions").doc(restartedAsSessionId),
        );
        if (nextSessionSnap.exists) {
          const restart =
            existingAttempt.restart &&
            typeof existingAttempt.restart === "object"
              ? (existingAttempt.restart as StudyRestart)
              : undefined;
          return {
            session: toSession(nextSessionSnap.id, nextSessionSnap.data()!),
            ...(restart ? { restart } : {}),
          };
        }
      }
      return { session: toSession(sessionSnap.id, sessionSnap.data()!) };
    }

    const session = toSession(sessionSnap.id, sessionSnap.data()!);
    const sessionPatch: Record<string, unknown> = { updatedAt: timestamp };
    const { toneHint, ...persistedResult } = result;

    const restartPlan = result.forcedAdvance
      ? createStudyRestart(
          session,
          input,
          { sessionId: nextSessionRef.id, restartId: restartRef.id },
          timestamp,
        )
      : undefined;

    if (restartPlan) {
      Object.assign(sessionPatch, {
        status: "restarted",
        restartedAt: timestamp,
        restartedAsSessionId: restartPlan.nextSession.id,
        restartTrigger: restartPlan.restart.trigger,
      });
    } else if (result.status === "technical_error") {
      // Technical failures never advance or consume a student attempt.
    } else if (result.status === "failed") {
      sessionPatch.attemptNumber = session.attemptNumber + 1;
    } else if (input.round === "plot") {
      sessionPatch.round = "feeling";
      sessionPatch.attemptNumber = 1;
      sessionPatch.lastPlotTranscript = input.transcript;
      sessionPatch.lastPlotAttemptId = input.attemptId;
    } else {
      sessionPatch.status = "awaiting_confirmation";
      sessionPatch.awaitingWorksheetNodeId = input.nodeId;
      sessionPatch.attemptNumber = 1;
      if (result.nextNodeId) {
        sessionPatch.nodeId = result.nextNodeId;
        sessionPatch.round = result.nextRound;
      }
      const worksheetRef = db
        .collection("worksheets")
        .doc(input.sessionId)
        .collection("entries")
        .doc(String(input.nodeId));
      transaction.set(worksheetRef, {
        nodeId: input.nodeId,
        storySummary: result.forcedAdvance
          ? ""
          : String(sessionSnap.data()?.lastPlotTranscript ?? ""),
        feelingTranscript: result.forcedAdvance ? "" : input.transcript,
        emotionWord: result.forcedAdvance
          ? ""
          : getNode(input.nodeId).targetEmotion,
        sourceAttemptId: input.attemptId,
        status: result.forcedAdvance ? "assisted" : "ready",
        updatedAt: timestamp,
      });
    }

    transaction.set(
      attemptRef,
      {
        ...withoutUndefinedProperties(input),
        ...persistedResult,
        ...(toneHint ? { toneHint } : {}),
        semantic: result.semantic,
        emotion: result.emotion,
        updatedAt: timestamp,
        completedAt: timestamp,
        ...(restartPlan
          ? {
              restartId: restartPlan.restart.id,
              restartedAsSessionId: restartPlan.nextSession.id,
              restart: restartPlan.restart,
            }
          : {}),
      },
      { merge: true },
    );
    transaction.update(sessionRef, sessionPatch);
    transaction.set(sessionRef.collection("messages").doc(), {
      role: "student",
      text: input.transcript,
      nodeId: input.nodeId,
      round: input.round,
      attemptId: input.attemptId,
      sequence: 0,
      createdAt: timestamp,
    });
    transaction.set(sessionRef.collection("messages").doc(), {
      role: "olaf",
      text: result.reply,
      templateId: result.replyTemplateId,
      toneHint: result.toneHint ?? null,
      nodeId: input.nodeId,
      round: input.round,
      attemptId: input.attemptId,
      sequence: 1,
      createdAt: timestamp,
    });

    if (restartPlan) {
      transaction.set(nextSessionRef, restartPlan.nextSession);
      transaction.set(restartRef, restartPlan.restart);
      transaction.set(
        db.collection("participants").doc(principal.uid),
        {
          activeSessionId: restartPlan.nextSession.id,
          lastActiveAt: timestamp,
          lastRestartAt: timestamp,
        },
        { merge: true },
      );
      getOpeningMessages().forEach((message, sequence) => {
        transaction.set(nextSessionRef.collection("messages").doc(), {
          role: "olaf",
          text: message.text,
          templateId: message.id,
          nodeId: 1,
          round: "plot",
          sequence,
          createdAt: timestamp,
        });
      });
      return {
        session: restartPlan.nextSession,
        restart: restartPlan.restart,
      };
    }

    return {
      session: toSession(session.id, { ...session, ...sessionPatch }),
    };
  });
}

export async function confirmWorksheet(
  principal: Principal,
  sessionId: string,
  nodeId: NodeId,
): Promise<StudySession> {
  const db = adminDb();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const entryRef = db
    .collection("worksheets")
    .doc(sessionId)
    .collection("entries")
    .doc(String(nodeId));

  return db.runTransaction(async (transaction) => {
    const [sessionSnap, entrySnap] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(entryRef),
    ]);
    if (!sessionSnap.exists || !entrySnap.exists) {
      throw new AuthError("Worksheet entry was not found.", 404);
    }
    if (sessionSnap.data()?.participantId !== principal.uid) {
      throw new AuthError("This worksheet belongs to another participant.", 403);
    }
    if (Number(sessionSnap.data()?.awaitingWorksheetNodeId) !== nodeId) {
      throw new AuthError("This worksheet is not awaiting confirmation.", 409);
    }

    const completed = nodeId === 5;
    const updatedAt = now();
    transaction.set(
      entryRef,
      { status: "confirmed", confirmedAt: updatedAt },
      { merge: true },
    );
    transaction.update(sessionRef, {
      status: completed ? "completed" : "active",
      awaitingWorksheetNodeId: FieldValue.delete(),
      updatedAt,
      ...(completed ? { completedAt: updatedAt } : {}),
    });
    if (completed) {
      transaction.set(
        db.collection("participants").doc(principal.uid),
        { activeSessionId: FieldValue.delete(), lastCompletedAt: updatedAt },
        { merge: true },
      );
    }
    return toSession(sessionSnap.id, {
      ...sessionSnap.data()!,
      status: completed ? "completed" : "active",
      awaitingWorksheetNodeId: undefined,
      updatedAt,
    });
  });
}

export async function reopenWorksheet(
  principal: Principal,
  sessionId: string,
  nodeId: NodeId,
): Promise<StudySession> {
  const db = adminDb();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const entryRef = db
    .collection("worksheets")
    .doc(sessionId)
    .collection("entries")
    .doc(String(nodeId));
  return db.runTransaction(async (transaction) => {
    const sessionSnap = await transaction.get(sessionRef);
    if (!sessionSnap.exists) throw new AuthError("Session was not found.", 404);
    if (sessionSnap.data()?.participantId !== principal.uid) {
      throw new AuthError("This worksheet belongs to another participant.", 403);
    }
    if (Number(sessionSnap.data()?.awaitingWorksheetNodeId) !== nodeId) {
      throw new AuthError("This worksheet is not awaiting confirmation.", 409);
    }
    const updatedAt = now();
    transaction.update(sessionRef, {
      nodeId,
      round: "feeling",
      attemptNumber: 1,
      status: "active",
      awaitingWorksheetNodeId: FieldValue.delete(),
      updatedAt,
    });
    transaction.set(
      entryRef,
      { status: "pending", reopenedAt: updatedAt },
      { merge: true },
    );
    return toSession(sessionSnap.id, {
      ...sessionSnap.data()!,
      nodeId,
      round: "feeling",
      attemptNumber: 1,
      status: "active",
      awaitingWorksheetNodeId: undefined,
      updatedAt,
    });
  });
}

export async function getSessionMessages(
  principal: Principal,
  sessionId: string,
) {
  const session = await adminDb().collection("sessions").doc(sessionId).get();
  if (!session.exists) throw new AuthError("Session was not found.", 404);
  if (
    session.data()?.participantId !== principal.uid &&
    principal.role !== "researcher"
  ) {
    throw new AuthError("This session belongs to another participant.", 403);
  }
  const messages = await session.ref
    .collection("messages")
    .orderBy("createdAt", "asc")
    .get();
  const rows: Array<Record<string, unknown>> = messages.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  return rows
    .sort((left, right) => {
      const timeDifference = String(left.createdAt).localeCompare(
        String(right.createdAt),
      );
      if (timeDifference !== 0) return timeDifference;
      return Number(left.sequence ?? Number.MAX_SAFE_INTEGER) -
        Number(right.sequence ?? Number.MAX_SAFE_INTEGER);
    });
}

export async function getWorksheetEntries(
  principal: Principal,
  sessionId: string,
) {
  const session = await adminDb().collection("sessions").doc(sessionId).get();
  if (!session.exists) throw new AuthError("Session was not found.", 404);
  if (
    session.data()?.participantId !== principal.uid &&
    principal.role !== "researcher"
  ) {
    throw new AuthError("This session belongs to another participant.", 403);
  }
  const entries = await adminDb()
    .collection("worksheets")
    .doc(sessionId)
    .collection("entries")
    .orderBy("nodeId", "asc")
    .get();
  return entries.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
