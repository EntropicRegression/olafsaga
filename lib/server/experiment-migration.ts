import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { buildLegacyMigrationPlan, type LegacyParticipantRecord, type LegacySessionRecord } from "@/lib/study/legacy-migration";
import { createExperimentDraft } from "@/lib/study/experiment";
import type { ExperimentBatch, ExperimentGroup } from "@/lib/study/types";
import { AuthError, type Principal } from "./auth";
import { getActiveStudyConfig } from "./study-config";

const LEGACY_EXPERIMENT_CODE = "LEGACY-UNSCOPED";
const LEGACY_EXPERIMENT_ID = "legacy-unscoped";
const now = () => new Date().toISOString();

function assertResearcher(principal: Principal): void {
  if (principal.role !== "researcher") throw new AuthError("Researcher access is required.", 403);
}

async function getLegacyExperiment(principal: Principal, create: boolean): Promise<ExperimentBatch> {
  assertResearcher(principal);
  const db = adminDb();
  const ref = db.collection("experiments").doc(LEGACY_EXPERIMENT_ID);
  const snapshot = await ref.get();
  if (snapshot.exists) {
    const data = snapshot.data()!;
    return {
      id: snapshot.id,
      code: String(data.code),
      name: String(data.name),
      mode: data.mode,
      status: data.status,
      configVersion: String(data.configVersion),
      vocabularyVersion: String(data.vocabularyVersion),
      thresholds: data.thresholds,
      consentVersion: String(data.consentVersion),
      allocationMethod: "permuted-block-4-6",
      participantCodePrefix: String(data.participantCodePrefix),
      rosterSize: Number(data.rosterSize ?? 0),
      createdAt: String(data.createdAt),
      createdBy: String(data.createdBy),
      activatedAt: data.activatedAt ? String(data.activatedAt) : undefined,
      activatedBy: data.activatedBy ? String(data.activatedBy) : undefined,
      closedAt: data.closedAt ? String(data.closedAt) : undefined,
      closedBy: data.closedBy ? String(data.closedBy) : undefined,
    };
  }
  if (!create) {
    const activeConfig = await getActiveStudyConfig();
    return {
      ...createExperimentDraft({
        id: LEGACY_EXPERIMENT_ID,
        code: LEGACY_EXPERIMENT_CODE,
        name: "Legacy unscoped records",
        mode: "test",
        configVersion: activeConfig.configVersion,
        vocabularyVersion: activeConfig.vocabularyVersion,
        thresholds: activeConfig.thresholds,
        consentVersion: "legacy-unknown",
        participantCodePrefix: "LEGACY",
        createdBy: principal.uid,
        createdAt: now(),
      }),
      status: "active",
    };
  }
  const activeConfig = await getActiveStudyConfig();
  const timestamp = now();
  const experiment = {
    ...createExperimentDraft({
      id: LEGACY_EXPERIMENT_ID,
      code: LEGACY_EXPERIMENT_CODE,
      name: "Legacy unscoped records",
      mode: "test" as const,
      configVersion: activeConfig.configVersion,
      vocabularyVersion: activeConfig.vocabularyVersion,
      thresholds: activeConfig.thresholds,
      consentVersion: "legacy-unknown",
      participantCodePrefix: "LEGACY",
      createdBy: principal.uid,
      createdAt: timestamp,
    }),
    status: "active" as const,
    activatedAt: timestamp,
    activatedBy: principal.uid,
  };
  await ref.create(experiment);
  await db.collection("auditLogs").add({
    action: "experiment.created",
    experimentId: experiment.id,
    experimentCode: experiment.code,
    mode: experiment.mode,
    researcherId: principal.uid,
    migration: "legacy",
    createdAt: timestamp,
  });
  return experiment;
}

export async function inspectLegacyMigration(principal: Principal) {
  assertResearcher(principal);
  const db = adminDb();
  const [participants, sessions, experimentSnapshot] = await Promise.all([
    db.collection("participants").where("role", "==", "student").get(),
    db.collection("sessions").get(),
    db.collection("experiments").doc(LEGACY_EXPERIMENT_ID).get(),
  ]);
  const participantIds = new Set(
    participants.docs
      .filter((doc) => !doc.data().activeExperimentId)
      .map((doc) => doc.id),
  );
  const sessionCount = sessions.docs.filter((doc) => !doc.data().experimentId && participantIds.has(String(doc.data().participantId))).length;
  return {
    experimentId: LEGACY_EXPERIMENT_ID,
    experimentExists: experimentSnapshot.exists,
    participantCount: participantIds.size,
    sessionCount,
    status: experimentSnapshot.exists ? String(experimentSnapshot.data()?.status ?? "unknown") : "missing",
  };
}

type WriteOperation = (batch: FirebaseFirestore.WriteBatch) => void;

async function commitOperations(operations: WriteOperation[]): Promise<void> {
  const db = adminDb();
  for (let offset = 0; offset < operations.length; offset += 450) {
    const batch = db.batch();
    operations.slice(offset, offset + 450).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

export async function migrateLegacyRecords(principal: Principal) {
  assertResearcher(principal);
  const db = adminDb();
  const experiment = await getLegacyExperiment(principal, true);
  const [participantSnapshot, sessionSnapshot, attemptSnapshot, restartSnapshot, messageSnapshot, entrySnapshot, noteSnapshot] = await Promise.all([
    db.collection("participants").where("role", "==", "student").get(),
    db.collection("sessions").get(),
    db.collectionGroup("attempts").get(),
    db.collection("studyRestarts").get(),
    db.collectionGroup("messages").get(),
    db.collectionGroup("entries").get(),
    db.collectionGroup("researchNotes").get(),
  ]);
  const participants: LegacyParticipantRecord[] = participantSnapshot.docs
    .filter((doc) => !doc.data().activeExperimentId)
    .map((doc) => ({
      id: doc.id,
      code: String(doc.data().code ?? doc.id),
      classId: String(doc.data().classId ?? "LEGACY-UNKNOWN"),
      group: doc.data().group === "agent1" || doc.data().group === "agent2" ? doc.data().group as ExperimentGroup : null,
      consentVersion: doc.data().consentVersion ? String(doc.data().consentVersion) : null,
      consentedAt: doc.data().consentedAt ? String(doc.data().consentedAt) : null,
      createdAt: doc.data().createdAt ? String(doc.data().createdAt) : undefined,
    }));
  if (participants.length === 0) {
    return {
      experimentId: experiment.id,
      participantCount: 0,
      sessionCount: 0,
      linkedDocumentCount: 0,
      skippedParticipants: participantSnapshot.size,
      participantCodes: [],
      alreadyMigrated: true,
    };
  }
  const sessions: LegacySessionRecord[] = sessionSnapshot.docs.map((doc) => ({
    id: doc.id,
    participantId: String(doc.data().participantId),
    experimentId: doc.data().experimentId ? String(doc.data().experimentId) : undefined,
    enrollmentId: doc.data().enrollmentId ? String(doc.data().enrollmentId) : undefined,
  }));
  const plan = buildLegacyMigrationPlan(experiment, participants, sessions, now());
  const enrollmentByParticipant = new Map(plan.enrollments.map((enrollment) => [enrollment.participantId, enrollment]));
  const sessionIds = new Set(plan.sessionLinks.map((link) => link.sessionId));
  const operations: WriteOperation[] = [];
  for (const enrollment of plan.enrollments) {
    const ref = db.collection("experiments").doc(experiment.id).collection("enrollments").doc(enrollment.id);
    operations.push((batch) => batch.set(ref, enrollment, { merge: true }));
  }
  for (const link of plan.participantLinks) {
    const participantRef = db.collection("participants").doc(link.participantId);
    operations.push((batch) => batch.set(participantRef, {
      activeExperimentId: experiment.id,
      activeEnrollmentId: link.enrollmentId,
      group: link.group,
      updatedAt: now(),
    }, { merge: true }));
  }
  for (const link of plan.sessionLinks) {
    operations.push((batch) => batch.set(db.collection("sessions").doc(link.sessionId), {
      experimentId: experiment.id,
      enrollmentId: link.enrollmentId,
    }, { merge: true }));
  }
  for (const snapshot of attemptSnapshot.docs) {
    const sessionId = snapshot.ref.parent.parent?.id;
    if (sessionId && sessionIds.has(sessionId)) {
      const link = plan.sessionLinks.find((item) => item.sessionId === sessionId);
      operations.push((batch) => batch.set(snapshot.ref, {
        experimentId: experiment.id,
        ...(link?.enrollmentId ? { enrollmentId: link.enrollmentId } : {}),
      }, { merge: true }));
    }
  }
  for (const snapshot of messageSnapshot.docs) {
    const sessionId = snapshot.ref.parent.parent?.id;
    const link = sessionId ? plan.sessionLinks.find((item) => item.sessionId === sessionId) : undefined;
    if (sessionId && sessionIds.has(sessionId)) {
      operations.push((batch) => batch.set(snapshot.ref, {
        experimentId: experiment.id,
        ...(link?.enrollmentId ? { enrollmentId: link.enrollmentId } : {}),
      }, { merge: true }));
    }
  }
  for (const snapshot of entrySnapshot.docs) {
    const sessionId = snapshot.ref.parent.parent?.id;
    const link = sessionId ? plan.sessionLinks.find((item) => item.sessionId === sessionId) : undefined;
    if (sessionId && sessionIds.has(sessionId)) {
      operations.push((batch) => batch.set(snapshot.ref, {
        experimentId: experiment.id,
        ...(link?.enrollmentId ? { enrollmentId: link.enrollmentId } : {}),
      }, { merge: true }));
    }
  }
  for (const snapshot of noteSnapshot.docs) {
    const sessionId = snapshot.ref.parent.parent?.id;
    const link = sessionId ? plan.sessionLinks.find((item) => item.sessionId === sessionId) : undefined;
    if (sessionId && sessionIds.has(sessionId)) {
      operations.push((batch) => batch.set(snapshot.ref, {
        experimentId: experiment.id,
        ...(link?.enrollmentId ? { enrollmentId: link.enrollmentId } : {}),
      }, { merge: true }));
    }
  }
  for (const snapshot of restartSnapshot.docs) {
    const participantId = String(snapshot.data().participantId ?? "");
    const enrollment = enrollmentByParticipant.get(participantId);
    if (enrollment) operations.push((batch) => batch.set(snapshot.ref, { experimentId: experiment.id, enrollmentId: enrollment.id }, { merge: true }));
  }
  const timestamp = now();
  operations.push((batch) => batch.set(db.collection("experiments").doc(experiment.id), {
    status: "active",
    rosterSize: plan.enrollments.length,
    updatedAt: timestamp,
  }, { merge: true }));
  operations.push((batch) => batch.set(db.collection("auditLogs").doc(), {
    action: "experiment.legacy_migration_applied",
    experimentId: experiment.id,
    researcherId: principal.uid,
    participantCount: plan.enrollments.length,
    sessionCount: plan.sessionLinks.length,
    operationCount: operations.length,
    createdAt: timestamp,
  }));
  await commitOperations(operations);
  return {
    experimentId: experiment.id,
    participantCount: plan.enrollments.length,
    sessionCount: plan.sessionLinks.length,
    linkedDocumentCount: operations.length,
    skippedParticipants: participantSnapshot.size - participants.length,
    participantCodes: participants.map((participant) => participant.code),
  };
}
