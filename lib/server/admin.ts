import "server-only";

import { randomBytes } from "node:crypto";
import { adminAuth, adminBucket, adminDb } from "@/lib/firebase/admin";
import { participantEmail } from "@/lib/auth/participant";
import { buildParticipantResearchExport } from "@/lib/study/research-export";
import type { ExperimentGroup, NodeId } from "@/lib/study/types";
import { HttpError } from "./http";

const now = () => new Date().toISOString();

export interface ParticipantImportRow {
  code: string;
  password: string;
  classId: string;
  consentVersion: string;
  consentedAt: string;
}

function normalizeParticipantRow(row: ParticipantImportRow): ParticipantImportRow {
  return {
    code: row.code.trim().toUpperCase(),
    password: row.password,
    classId: row.classId.trim(),
    consentVersion: row.consentVersion.trim(),
    consentedAt: row.consentedAt,
  };
}

export async function createParticipant(
  rawRow: ParticipantImportRow,
  researcherId: string,
) {
  const row = normalizeParticipantRow(rawRow);
  const email = participantEmail(row.code);
  const existingProfile = await adminDb()
    .collection("participants")
    .where("code", "==", row.code)
    .limit(1)
    .get();
  if (!existingProfile.empty) {
    throw new HttpError(
      `受試者代碼 ${row.code} 已存在；為避免覆寫密碼與分組，未建立帳號。`,
      409,
    );
  }
  try {
    await adminAuth().getUserByEmail(email);
    throw new HttpError(
      `受試者代碼 ${row.code} 已存在；為避免覆寫密碼與分組，未建立帳號。`,
      409,
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if ((error as { code?: string })?.code !== "auth/user-not-found") {
      throw error;
    }
  }

  const user = await adminAuth().createUser({
    email,
    password: row.password,
    emailVerified: true,
    displayName: row.code,
  });
  try {
    const createdAt = now();
    await adminDb().collection("participants").doc(user.uid).create({
      code: row.code,
      classId: row.classId,
      role: "student",
      group: null,
      consentVersion: row.consentVersion,
      consentedAt: row.consentedAt,
      createdBy: researcherId,
      createdAt,
      updatedAt: createdAt,
    });
    await adminDb().collection("auditLogs").add({
      action: "participant.created",
      participantId: user.uid,
      participantCode: row.code,
      classId: row.classId,
      researcherId,
      createdAt,
    });
    return {
      uid: user.uid,
      code: row.code,
      classId: row.classId,
      consentVersion: row.consentVersion,
      consentedAt: row.consentedAt,
      group: null,
    };
  } catch (error) {
    await adminAuth().deleteUser(user.uid).catch(() => undefined);
    throw error;
  }
}

export async function importParticipants(
  rows: ParticipantImportRow[],
  researcherId: string,
) {
  const results: Array<{ code: string; uid?: string; error?: string }> = [];
  for (const rawRow of rows) {
    const row = normalizeParticipantRow(rawRow);
    try {
      const email = participantEmail(row.code);
      let user;
      try {
        user = await adminAuth().getUserByEmail(email);
        await adminAuth().updateUser(user.uid, {
          password: row.password,
          disabled: false,
        });
      } catch {
        user = await adminAuth().createUser({
          email,
          password: row.password,
          emailVerified: true,
          displayName: row.code,
        });
      }
      await adminDb().collection("participants").doc(user.uid).set(
        {
          code: row.code,
          classId: row.classId,
          role: "student",
          group: null,
          consentVersion: row.consentVersion,
          consentedAt: row.consentedAt,
          updatedAt: now(),
        },
        { merge: true },
      );
      results.push({ code: row.code, uid: user.uid });
    } catch (error) {
      results.push({
        code: row.code,
        error: error instanceof Error ? error.message : "Import failed.",
      });
    }
  }
  await adminDb().collection("auditLogs").add({
    action: "participants.imported",
    researcherId,
    count: rows.length,
    succeeded: results.filter((result) => result.uid).length,
    createdAt: now(),
  });
  return results;
}

export async function getAdminOverview() {
  const db = adminDb();
  const [participantsSnapshot, sessionsSnapshot, attemptsSnapshot] =
    await Promise.all([
      db.collection("participants").where("role", "==", "student").limit(500).get(),
      db.collection("sessions").orderBy("updatedAt", "desc").limit(200).get(),
      db.collectionGroup("attempts").orderBy("updatedAt", "desc").limit(1000).get(),
    ]);

  const participants: Array<Record<string, unknown>> =
    participantsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  const sessions: Array<Record<string, unknown>> = sessionsSnapshot.docs.map(
    (doc) => ({
      id: doc.id,
      ...doc.data(),
    }),
  );
  const attempts: Array<Record<string, unknown>> = attemptsSnapshot.docs.map(
    (doc) => ({
      id: doc.id,
      sessionId: doc.ref.parent.parent?.id,
      ...doc.data(),
    }),
  );
  const completed = sessions.filter((session) => session.status === "completed");
  const studyRoots = new Set(
    sessions.map((session) => String(session.rootSessionId ?? session.id)),
  );
  const completedRoots = new Set(
    completed.map((session) => String(session.rootSessionId ?? session.id)),
  );
  const assigned = participants.filter(
    (participant) =>
      participant.group === "agent1" || participant.group === "agent2",
  );
  const groupCounts = assigned.reduce<Record<ExperimentGroup, number>>(
    (counts, participant) => {
      const group = participant.group as ExperimentGroup;
      counts[group] += 1;
      return counts;
    },
    { agent1: 0, agent2: 0 },
  );
  const decisionCounts = attempts.reduce<Record<string, number>>(
    (counts, attempt) => {
      const decision = String(attempt.decision ?? "PENDING");
      counts[decision] = (counts[decision] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const nodeStats = ([1, 2, 3, 4, 5] as NodeId[]).map((nodeId) => {
    const nodeAttempts = attempts.filter(
      (attempt) => Number(attempt.nodeId) === nodeId,
    );
    const passed = nodeAttempts.filter((attempt) => attempt.status === "passed");
    const average = (field: "accuracy" | "fluency") => {
      const values = nodeAttempts
        .map((attempt) =>
          Number(
            (attempt.speechScores as Record<string, unknown> | undefined)?.[field],
          ),
        )
        .filter(Number.isFinite);
      return values.length
        ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
        : 0;
    };
    return {
      nodeId,
      attempts: nodeAttempts.length,
      passRate: nodeAttempts.length
        ? Math.round((passed.length / nodeAttempts.length) * 100)
        : 0,
      accuracy: average("accuracy"),
      fluency: average("fluency"),
    };
  });

  return {
    metrics: {
      participants: participants.length,
      activeSessions: sessions.filter((session) =>
        ["active", "awaiting_confirmation"].includes(String(session.status)),
      ).length,
      completedSessions: completed.length,
      completionRate: studyRoots.size
        ? Math.round((completedRoots.size / studyRoots.size) * 100)
        : 0,
      attempts: attempts.length,
      estimatedAudioGb: Number(
        ((attempts.length * 0.64) / 1024).toFixed(2),
      ),
    },
    groupCounts,
    decisionCounts,
    nodeStats,
    sessions: sessions.slice(0, 50),
    participants: participants.slice(0, 100),
  };
}

export async function getAdminSessionDetail(sessionId: string) {
  const db = adminDb();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const [session, attempts, messages, worksheet, notes] = await Promise.all([
    sessionRef.get(),
    sessionRef.collection("attempts").orderBy("createdAt", "asc").get(),
    sessionRef.collection("messages").orderBy("createdAt", "asc").get(),
    db
      .collection("worksheets")
      .doc(sessionId)
      .collection("entries")
      .orderBy("nodeId", "asc")
      .get(),
    sessionRef.collection("researchNotes").orderBy("createdAt", "asc").get(),
  ]);
  if (!session.exists) throw new Error("Session was not found.");
  return {
    session: { id: session.id, ...session.data() },
    attempts: attempts.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    messages: messages.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    worksheet: worksheet.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    notes: notes.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  };
}

export async function addResearchNote(
  sessionId: string,
  text: string,
  researcherId: string,
) {
  const db = adminDb();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const session = await sessionRef.get();
  if (!session.exists) throw new Error("Session was not found.");
  const createdAt = now();
  const noteRef = sessionRef.collection("researchNotes").doc();
  await db.runTransaction(async (transaction) => {
    transaction.set(noteRef, {
      text,
      researcherId,
      createdAt,
    });
    transaction.set(db.collection("auditLogs").doc(), {
      action: "session.note_added",
      sessionId,
      noteId: noteRef.id,
      researcherId,
      createdAt,
    });
  });
  return { id: noteRef.id, text, researcherId, createdAt };
}

export async function createResearchExport(researcherId: string) {
  const db = adminDb();
  const exportId = `export-${Date.now()}-${randomBytes(3).toString("hex")}`;
  const [
    participants,
    sessions,
    attempts,
    restarts,
    messages,
    worksheets,
    researchNotes,
  ] = await Promise.all([
    db.collection("participants").where("role", "==", "student").get(),
    db.collection("sessions").get(),
    db.collectionGroup("attempts").get(),
    db.collection("studyRestarts").get(),
    db.collectionGroup("messages").get(),
    db.collectionGroup("entries").get(),
    db.collectionGroup("researchNotes").get(),
  ]);
  const mapDocuments = (
    snapshots: FirebaseFirestore.QuerySnapshot,
  ): Array<Record<string, unknown> & { id: string }> =>
    snapshots.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  const mapSessionDocuments = (
    snapshots: FirebaseFirestore.QuerySnapshot,
  ): Array<Record<string, unknown> & { id: string; sessionId: string }> =>
    snapshots.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
      sessionId: doc.ref.parent.parent?.id ?? "",
    }));
  const exportedAt = now();
  const artifacts = buildParticipantResearchExport(
    {
      participants: mapDocuments(participants),
      sessions: mapDocuments(sessions),
      attempts: mapSessionDocuments(attempts),
      restarts: mapDocuments(restarts),
      messages: mapSessionDocuments(messages),
      worksheets: mapSessionDocuments(worksheets),
      researchNotes: mapSessionDocuments(researchNotes),
    },
    exportedAt,
  );

  const prefix = `exports/${exportId}`;
  await Promise.all([
    adminBucket()
      .file(`${prefix}/participant-records.jsonl`)
      .save(artifacts.participantRecordsJsonl, {
        contentType: "application/x-ndjson; charset=utf-8",
        resumable: false,
      }),
    adminBucket()
      .file(`${prefix}/participant-summary.csv`)
      .save(artifacts.participantSummaryCsv, {
      contentType: "text/csv; charset=utf-8",
      resumable: false,
      }),
    adminBucket().file(`${prefix}/manifest.json`).save(artifacts.manifestJson, {
      contentType: "application/json; charset=utf-8",
      resumable: false,
    }),
  ]);
  const [recordsUrl] = await adminBucket()
    .file(`${prefix}/participant-records.jsonl`)
    .getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  const [summaryUrl] = await adminBucket()
    .file(`${prefix}/participant-summary.csv`)
    .getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  const [manifestUrl] = await adminBucket()
    .file(`${prefix}/manifest.json`)
    .getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  await db.collection("exports").doc(exportId).set({
    status: "data_ready",
    schemaVersion: "participant-research-export-v1",
    researcherId,
    prefix,
    participantCount: artifacts.participantCount,
    sessionCount: artifacts.sessionCount,
    attemptCount: artifacts.attemptCount,
    restartCount: artifacts.restartCount,
    audioIncluded: false,
    createdAt: exportedAt,
  });
  await db.collection("auditLogs").add({
    action: "export.created",
    researcherId,
    exportId,
    schemaVersion: "participant-research-export-v1",
    audioIncluded: false,
    createdAt: exportedAt,
  });
  return {
    exportId,
    recordsUrl,
    summaryUrl,
    manifestUrl,
    participantCount: artifacts.participantCount,
    expiresInSeconds: 300,
  };
}

export async function getResearchExport(exportId: string) {
  if (!/^export-[A-Za-z0-9-]+$/.test(exportId)) {
    throw new Error("Invalid export identifier.");
  }
  const snapshot = await adminDb().collection("exports").doc(exportId).get();
  if (!snapshot.exists) throw new Error("Export was not found.");
  const data = snapshot.data()!;
  const response: Record<string, unknown> = {
    exportId,
    status: data.status,
    schemaVersion: data.schemaVersion,
    participantCount: data.participantCount,
    audioIncluded: false,
  };
  if (typeof data.prefix === "string") {
    const expires = Date.now() + 5 * 60 * 1000;
    const [[recordsUrl], [summaryUrl], [manifestUrl]] = await Promise.all([
      adminBucket()
        .file(`${data.prefix}/participant-records.jsonl`)
        .getSignedUrl({ action: "read", expires }),
      adminBucket()
        .file(`${data.prefix}/participant-summary.csv`)
        .getSignedUrl({ action: "read", expires }),
      adminBucket()
        .file(`${data.prefix}/manifest.json`)
        .getSignedUrl({ action: "read", expires }),
    ]);
    Object.assign(response, {
      recordsUrl,
      summaryUrl,
      manifestUrl,
      expiresInSeconds: 300,
    });
  }
  return response;
}

export async function getAudioSignedUrl(path: string, researcherId: string) {
  if (!path.startsWith("audio/") || path.includes("..")) {
    throw new Error("Invalid audio path.");
  }
  const [url] = await adminBucket()
    .file(path)
    .getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  await adminDb().collection("auditLogs").add({
    action: "audio.link_created",
    researcherId,
    path,
    createdAt: now(),
  });
  return { url, expiresInSeconds: 300 };
}

export async function deleteAudioObject(path: string, researcherId: string) {
  if (!path.startsWith("audio/") || path.includes("..")) {
    throw new Error("Invalid audio path.");
  }
  await adminBucket().file(path).delete({ ignoreNotFound: true });
  await adminDb().collection("auditLogs").add({
    action: "audio.deleted",
    researcherId,
    path,
    createdAt: now(),
  });
}
