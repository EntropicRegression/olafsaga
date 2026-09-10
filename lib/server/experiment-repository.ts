import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import {
  activateExperiment,
  archiveExperiment,
  closeExperiment,
  createExperimentDraft,
} from "@/lib/study/experiment";
import { resolveStudyThresholds } from "@/lib/study/config";
import type {
  Enrollment,
  ExperimentBatch,
  ExperimentBatchStatus,
  ExperimentMode,
} from "@/lib/study/types";
import { AuthError, type Principal } from "./auth";
import { getActiveStudyConfig } from "./study-config";

const now = () => new Date().toISOString();

function experimentTransitionPatch(experiment: ExperimentBatch): Record<string, unknown> {
  return {
    status: experiment.status,
    rosterSize: experiment.rosterSize,
    ...(experiment.activatedAt ? { activatedAt: experiment.activatedAt } : {}),
    ...(experiment.activatedBy ? { activatedBy: experiment.activatedBy } : {}),
    ...(experiment.closedAt ? { closedAt: experiment.closedAt } : {}),
    ...(experiment.closedBy ? { closedBy: experiment.closedBy } : {}),
  };
}

function toExperiment(
  id: string,
  data: FirebaseFirestore.DocumentData,
): ExperimentBatch {
  return {
    id,
    code: String(data.code),
    name: String(data.name),
    mode: data.mode as ExperimentMode,
    status: data.status as ExperimentBatchStatus,
    configVersion: String(data.configVersion),
    vocabularyVersion: String(data.vocabularyVersion),
    thresholds: resolveStudyThresholds(data.thresholds),
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

function toEnrollment(
  id: string,
  experimentId: string,
  data: FirebaseFirestore.DocumentData,
): Enrollment {
  return {
    id,
    experimentId,
    participantId: String(data.participantId),
    participantCode: String(data.participantCode),
    classId: String(data.classId),
    group: data.group,
    status: data.status,
    allocationBlockId: String(data.allocationBlockId),
    allocationPosition: Number(data.allocationPosition),
    allocationMethod: "permuted-block-4-6",
    consentVersion: String(data.consentVersion),
    consentedAt: String(data.consentedAt),
    credentialsIssuedAt: String(data.credentialsIssuedAt),
    startedAt: data.startedAt ? String(data.startedAt) : undefined,
    completedAt: data.completedAt ? String(data.completedAt) : undefined,
  };
}

function assertResearcher(principal: Principal): void {
  if (principal.role !== "researcher") {
    throw new AuthError("Researcher access is required.", 403);
  }
}

export interface CreateExperimentInput {
  code: string;
  name: string;
  mode: ExperimentMode;
  consentVersion: string;
  participantCodePrefix: string;
}

export async function createExperiment(
  principal: Principal,
  input: CreateExperimentInput,
): Promise<ExperimentBatch> {
  assertResearcher(principal);
  const db = adminDb();
  const activeConfig = await getActiveStudyConfig();
  const experimentRef = db.collection("experiments").doc();
  const createdAt = now();
  const experiment = createExperimentDraft({
    ...input,
    id: experimentRef.id,
    configVersion: activeConfig.configVersion,
    vocabularyVersion: activeConfig.vocabularyVersion,
    thresholds: activeConfig.thresholds,
    createdBy: principal.uid,
    createdAt,
  });

  await db.runTransaction(async (transaction) => {
    const duplicate = await transaction.get(
      db.collection("experiments").where("code", "==", experiment.code).limit(1),
    );
    if (!duplicate.empty) {
      throw new AuthError("An experiment with this code already exists.", 409);
    }
    transaction.create(experimentRef, experiment);
    transaction.create(db.collection("auditLogs").doc(), {
      action: "experiment.created",
      experimentId: experiment.id,
      experimentCode: experiment.code,
      mode: experiment.mode,
      researcherId: principal.uid,
      createdAt,
    });
  });
  return experiment;
}

export async function listExperiments(
  principal: Principal,
): Promise<ExperimentBatch[]> {
  assertResearcher(principal);
  const snapshot = await adminDb()
    .collection("experiments")
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  return snapshot.docs
    .filter((doc) => doc.data().status !== "archived")
    .map((doc) => toExperiment(doc.id, doc.data()));
}

export async function getExperiment(
  principal: Principal,
  experimentId: string,
): Promise<ExperimentBatch> {
  assertResearcher(principal);
  const snapshot = await adminDb().collection("experiments").doc(experimentId).get();
  if (!snapshot.exists) throw new AuthError("Experiment was not found.", 404);
  return toExperiment(snapshot.id, snapshot.data()!);
}

export async function listEnrollments(
  principal: Principal,
  experimentId: string,
): Promise<Enrollment[]> {
  assertResearcher(principal);
  const snapshot = await adminDb()
    .collection("experiments")
    .doc(experimentId)
    .collection("enrollments")
    .orderBy("participantCode", "asc")
    .get();
  return snapshot.docs.map((doc) =>
    toEnrollment(doc.id, experimentId, doc.data()),
  );
}

export interface ExperimentReadiness {
  enrollmentCount: number;
  missingConsentCount: number;
  activeSessionCount: number;
  canActivate: boolean;
  canClose: boolean;
}

export async function getExperimentReadiness(
  principal: Principal,
  experimentId: string,
): Promise<ExperimentReadiness> {
  const experiment = await getExperiment(principal, experimentId);
  const db = adminDb();
  const [enrollmentSnapshot, sessionSnapshot] = await Promise.all([
    db.collection("experiments").doc(experimentId).collection("enrollments").get(),
    db.collection("sessions").where("experimentId", "==", experimentId).get(),
  ]);
  const enrollmentCount = enrollmentSnapshot.size;
  const missingConsentCount = enrollmentSnapshot.docs.filter(
    (doc) => !String(doc.data().consentedAt ?? "").trim(),
  ).length;
  const activeSessionCount = sessionSnapshot.docs.filter((doc) =>
    ["active", "awaiting_confirmation"].includes(String(doc.data().status)),
  ).length;
  return {
    enrollmentCount,
    missingConsentCount,
    activeSessionCount,
    canActivate:
      experiment.status === "draft" &&
      enrollmentCount > 0 &&
      (experiment.mode !== "formal" || missingConsentCount === 0),
    canClose: experiment.status === "active" && activeSessionCount === 0,
  };
}

export async function updateExperiment(
  principal: Principal,
  experimentId: string,
  patch: Pick<CreateExperimentInput, "name" | "mode" | "consentVersion" | "participantCodePrefix">,
): Promise<ExperimentBatch> {
  assertResearcher(principal);
  const db = adminDb();
  const ref = db.collection("experiments").doc(experimentId);
  const updatedAt = now();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new AuthError("Experiment was not found.", 404);
    const experiment = toExperiment(snapshot.id, snapshot.data()!);
    if (experiment.status !== "draft") {
      throw new AuthError("Only draft experiments can be edited.", 409);
    }
    const next = {
      ...experiment,
      name: patch.name.trim(),
      mode: patch.mode,
      consentVersion: patch.consentVersion.trim(),
      participantCodePrefix: patch.participantCodePrefix.trim().toUpperCase(),
    };
    transaction.update(ref, {
      name: next.name,
      mode: next.mode,
      consentVersion: next.consentVersion,
      participantCodePrefix: next.participantCodePrefix,
      updatedAt,
    });
    transaction.create(db.collection("auditLogs").doc(), {
      action: "experiment.updated",
      experimentId,
      researcherId: principal.uid,
      changedAt: updatedAt,
    });
    return next;
  });
}

export async function activateExperimentInStore(
  principal: Principal,
  experimentId: string,
): Promise<ExperimentBatch> {
  assertResearcher(principal);
  const db = adminDb();
  const ref = db.collection("experiments").doc(experimentId);
  const timestamp = now();
  return db.runTransaction(async (transaction) => {
    const [experimentSnapshot, enrollmentSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(ref.collection("enrollments")),
    ]);
    if (!experimentSnapshot.exists) {
      throw new AuthError("Experiment was not found.", 404);
    }
    const experiment = toExperiment(
      experimentSnapshot.id,
      experimentSnapshot.data()!,
    );
    const enrollments = enrollmentSnapshot.docs.map((doc) => doc.data());
    let next: ExperimentBatch;
    try {
      next = activateExperiment(
        experiment,
        { actorId: principal.uid, timestamp },
        {
          rosterSize: enrollments.length,
          missingConsentCount: enrollments.filter(
            (enrollment) => !String(enrollment.consentedAt ?? "").trim(),
          ).length,
        },
      );
    } catch (error) {
      throw new AuthError(error instanceof Error ? error.message : "Experiment cannot be activated.", 409);
    }
    transaction.update(ref, experimentTransitionPatch(next));
    transaction.create(db.collection("auditLogs").doc(), {
      action: "experiment.activated",
      experimentId,
      researcherId: principal.uid,
      rosterSize: next.rosterSize,
      activatedAt: timestamp,
    });
    return next;
  });
}

export async function closeExperimentInStore(
  principal: Principal,
  experimentId: string,
): Promise<ExperimentBatch> {
  assertResearcher(principal);
  const db = adminDb();
  const ref = db.collection("experiments").doc(experimentId);
  const [experimentSnapshot, sessionsSnapshot] = await Promise.all([
    ref.get(),
    db.collection("sessions").where("experimentId", "==", experimentId).get(),
  ]);
  if (!experimentSnapshot.exists) throw new AuthError("Experiment was not found.", 404);
  const activeSessionCount = sessionsSnapshot.docs.filter((doc) =>
    ["active", "awaiting_confirmation"].includes(String(doc.data().status)),
  ).length;
  const experiment = toExperiment(experimentSnapshot.id, experimentSnapshot.data()!);
  let next: ExperimentBatch;
  try {
    next = closeExperiment(
      experiment,
      { actorId: principal.uid, timestamp: now() },
      activeSessionCount,
    );
  } catch (error) {
    throw new AuthError(error instanceof Error ? error.message : "Experiment cannot be closed.", 409);
  }
  await ref.update(experimentTransitionPatch(next));
  await db.collection("auditLogs").add({
    action: "experiment.closed",
    experimentId,
    researcherId: principal.uid,
    closedAt: next.closedAt,
  });
  return next;
}

export async function archiveExperimentInStore(
  principal: Principal,
  experimentId: string,
): Promise<ExperimentBatch> {
  assertResearcher(principal);
  const db = adminDb();
  const ref = db.collection("experiments").doc(experimentId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new AuthError("Experiment was not found.", 404);
  let next: ExperimentBatch;
  try {
    next = archiveExperiment(
      toExperiment(snapshot.id, snapshot.data()!),
      { actorId: principal.uid, timestamp: now() },
    );
  } catch (error) {
    throw new AuthError(error instanceof Error ? error.message : "Experiment cannot be archived.", 409);
  }
  await ref.update(experimentTransitionPatch(next));
  await db.collection("auditLogs").add({
    action: "experiment.archived",
    experimentId,
    researcherId: principal.uid,
    archivedAt: now(),
  });
  return next;
}
