import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { participantEmail } from "@/lib/auth/participant";
import { participantCodeForSequence, planEnrollmentAllocations, type EnrollmentCandidate } from "@/lib/study/enrollment";
import type { Enrollment, ExperimentBatch } from "@/lib/study/types";
import { AuthError, type Principal } from "./auth";
import { HttpError } from "./http";

const now = () => new Date().toISOString();

export interface EnrollmentImportRow {
  participantCode?: string;
  classId: string;
  consentVersion?: string;
  consentedAt?: string;
}

export interface IssuedCredential {
  experimentCode: string;
  participantCode: string;
  password: string;
  classId: string;
  group: "agent1" | "agent2";
  accountStatus: "created" | "existing";
}

function assertResearcher(principal: Principal): void {
  if (principal.role !== "researcher") {
    throw new AuthError("Researcher access is required.", 403);
  }
}

function normalizeRow(row: EnrollmentImportRow, experiment: ExperimentBatch): EnrollmentImportRow {
  const code = row.participantCode?.trim().toUpperCase();
  const classId = row.classId.trim();
  if (classId.length < 1 || classId.length > 80) {
    throw new HttpError("Every enrollment row needs a classId between 1 and 80 characters.", 400);
  }
  if (code && !/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(code)) {
    throw new HttpError(`Invalid participant code: ${code}.`, 400);
  }
  const consentedAt = row.consentedAt?.trim() || "";
  if (consentedAt && Number.isNaN(Date.parse(consentedAt))) {
    throw new HttpError(`Invalid consentedAt for ${code ?? "participant"}.`, 400);
  }
  return {
    participantCode: code,
    classId,
    consentVersion: row.consentVersion?.trim() || experiment.consentVersion,
    consentedAt,
  };
}

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  const body = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
  return `O${body}7!`;
}

function credentialsCsv(credentials: IssuedCredential[]): string {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return [
    "experimentCode,participantCode,password,classId,group,accountStatus",
    ...credentials.map((credential) =>
      [credential.experimentCode, credential.participantCode, credential.password, credential.classId, credential.group, credential.accountStatus]
        .map(escape)
        .join(","),
    ),
  ].join("\n");
}

export async function createExperimentEnrollments(
  principal: Principal,
  experimentId: string,
  rawRows: EnrollmentImportRow[],
  idempotencyKey?: string,
  options: {
    passwordByCode?: Record<string, string>;
    auditAction?: "experiment.participants_generated" | "experiment.participants_imported";
  } = {},
): Promise<{ enrollments: Enrollment[]; credentials: IssuedCredential[]; credentialsCsv: string }> {
  assertResearcher(principal);
  if (rawRows.length < 1 || rawRows.length > 500) {
    throw new HttpError("Enrollment batch size must be between 1 and 500 rows.", 400);
  }
  const db = adminDb();
  const normalizedIdempotencyKey = idempotencyKey?.trim();
  if (normalizedIdempotencyKey && (normalizedIdempotencyKey.length < 8 || normalizedIdempotencyKey.length > 200)) {
    throw new HttpError("Idempotency-Key must be between 8 and 200 characters.", 400);
  }
  const markerRef = normalizedIdempotencyKey
    ? db.collection("experimentEnrollmentBatches").doc(
        createHash("sha256").update(`${experimentId}:${normalizedIdempotencyKey}`).digest("hex"),
      )
    : null;
  const experimentRef = db.collection("experiments").doc(experimentId);
  const [experimentSnapshot, participantsSnapshot] = await Promise.all([
    experimentRef.get(),
    db.collection("participants").where("role", "==", "student").limit(5000).get(),
  ]);
  if (!experimentSnapshot.exists) throw new AuthError("Experiment was not found.", 404);
  const experiment = experimentSnapshot.data() as ExperimentBatch;
  if (experiment.status !== "draft") {
    throw new HttpError("Enrollments can only be added while an experiment is in draft.", 409);
  }
  const passwordByCode = options.passwordByCode ?? {};
  if (Object.keys(passwordByCode).length > 0 && experiment.mode !== "test") {
    throw new HttpError("Custom passwords are only allowed for a draft test batch.", 409);
  }

  const existingCodes = new Set(
    participantsSnapshot.docs.map((doc) => String(doc.data().code ?? "").toUpperCase()),
  );
  const existingByCode = new Map(
    participantsSnapshot.docs.map((doc) => [
      String(doc.data().code ?? "").toUpperCase(),
      { uid: doc.id, data: doc.data() },
    ]),
  );
  const existingRows = rawRows.map((row) => normalizeRow(row, experiment));
  const requestedCodes = new Set<string>();
  let nextSequence = 1;
  const prefix = String(experiment.participantCodePrefix);
  for (const existingCode of existingCodes) {
    const match = existingCode.match(new RegExp(`^${prefix}-([0-9]+)$`, "i"));
    if (match) nextSequence = Math.max(nextSequence, Number(match[1]) + 1);
  }
  const rows = existingRows.map((row) => {
    let participantCode = row.participantCode;
    if (!participantCode) {
      do {
        participantCode = participantCodeForSequence(prefix, nextSequence++);
      } while (existingCodes.has(participantCode) || requestedCodes.has(participantCode));
    }
    if (requestedCodes.has(participantCode)) {
      throw new HttpError(`Participant code ${participantCode} already exists.`, 409);
    }
    requestedCodes.add(participantCode);
    return { ...row, participantCode };
  });

  const duplicateCode = rows.find((row) => existingByCode.has(row.participantCode!));
  if (duplicateCode) {
    throw new HttpError(
      `Participant code ${duplicateCode.participantCode} already exists; use password rotation instead of re-importing it.`,
      409,
    );
  }
  const preparedRows = rows.map((row) => ({
    row,
    existingParticipantId: undefined,
  }));
  const candidates: EnrollmentCandidate[] = preparedRows.map((prepared, index) => ({
    participantId: prepared.existingParticipantId ?? `pending-${index}`,
    participantCode: prepared.row.participantCode!,
    classId: prepared.row.classId,
  }));
  const classIds = [...new Set(preparedRows.map(({ row }) => row.classId))];
  const classRefs = classIds.map((classId) => experimentRef.collection("classes").doc(classId));
  if (markerRef) {
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(markerRef);
      if (existing.exists) {
        throw new HttpError("This enrollment request was already submitted. Credentials cannot be reissued with the same key.", 409);
      }
      transaction.create(markerRef, {
        experimentId,
        status: "processing",
        createdAt: now(),
      });
    });
  }
  const createdUsers: Array<{ uid: string; code: string; password: string }> = [];
  const createdUserByIndex = new Map<number, { uid: string; password: string }>();
  try {
    for (const [index, prepared] of preparedRows.entries()) {
      if (prepared.existingParticipantId) continue;
      const password = passwordByCode[prepared.row.participantCode!] ?? generatePassword();
      const user = await adminAuth().createUser({
        email: participantEmail(prepared.row.participantCode!),
        password,
        emailVerified: true,
        displayName: prepared.row.participantCode,
      });
      createdUsers.push({ uid: user.uid, code: prepared.row.participantCode!, password });
      createdUserByIndex.set(index, { uid: user.uid, password });
    }

    const timestamp = now();
    const created = await db.runTransaction(async (transaction) => {
      const currentExperiment = await transaction.get(experimentRef);
      if (!currentExperiment.exists || currentExperiment.data()?.status !== "draft") {
        throw new HttpError("The experiment changed state before enrollment could be committed.", 409);
      }
      const enrollmentQuery = experimentRef.collection("enrollments");
      const existingEnrollmentSnapshot = await transaction.get(enrollmentQuery);
      const existingEnrollmentCodes = new Set(
        existingEnrollmentSnapshot.docs.map((doc) => String(doc.data().participantCode ?? "").toUpperCase()),
      );
      if (rows.some((row) => existingEnrollmentCodes.has(row.participantCode!))) {
        throw new HttpError("One or more participant codes are already enrolled in this experiment.", 409);
      }
      const currentClassSnapshots = await Promise.all(classRefs.map((ref) => transaction.get(ref)));
      const participantRefs = preparedRows.map((prepared, index) =>
        db.collection("participants").doc(prepared.existingParticipantId ?? createdUserByIndex.get(index)?.uid ?? "missing"),
      );
      const currentParticipantSnapshots = await Promise.all(
        participantRefs.map((ref) => transaction.get(ref)),
      );
      const currentAllocations = planEnrollmentAllocations(
        candidates,
        currentClassSnapshots.map((snapshot) => ({
          classId: snapshot.id,
          allocatedCount: Number(snapshot.data()?.allocatedCount ?? 0),
          blockSize: 4,
        })),
      );
      const enrollments: Enrollment[] = [];
      const credentials: IssuedCredential[] = [];
      currentAllocations.forEach((allocation, index) => {
        const prepared = preparedRows[index];
        const row = prepared.row;
        const participantId = prepared.existingParticipantId ?? createdUserByIndex.get(index)?.uid;
        const participantSnapshot = currentParticipantSnapshots[index];
        if (!participantId) throw new HttpError("A participant account could not be provisioned.", 500);
        if (participantSnapshot.exists && (participantSnapshot.data()?.activeExperimentId || participantSnapshot.data()?.activeEnrollmentId)) {
          throw new HttpError(`Participant ${row.participantCode} already has an active enrollment.`, 409);
        }
        const enrollmentRef = enrollmentQuery.doc(participantId);
        const participantRef = participantRefs[index];
        const enrollment: Enrollment = {
          id: enrollmentRef.id,
          experimentId,
          participantId,
          participantCode: row.participantCode!,
          classId: row.classId,
          group: allocation.group,
          status: "issued",
          allocationBlockId: allocation.allocationBlockId,
          allocationPosition: allocation.allocationPosition,
          allocationMethod: "permuted-block-4-6",
          consentVersion: row.consentVersion || experiment.consentVersion,
          consentedAt: row.consentedAt || "",
          credentialsIssuedAt: timestamp,
        };
        transaction.create(enrollmentRef, enrollment);
        transaction.set(participantRef, {
          code: row.participantCode,
          classId: row.classId,
          group: allocation.group,
          role: "student",
          consentVersion: enrollment.consentVersion,
          consentedAt: enrollment.consentedAt,
          activeExperimentId: experimentId,
          activeEnrollmentId: enrollmentRef.id,
          ...(participantSnapshot.exists ? {} : { createdAt: timestamp }),
          updatedAt: timestamp,
        }, { merge: true });
        enrollments.push(enrollment);
        credentials.push({
          experimentCode: String(experiment.code),
          participantCode: row.participantCode!,
          password: createdUserByIndex.get(index)?.password ?? "",
          classId: row.classId,
          group: allocation.group,
          accountStatus: prepared.existingParticipantId ? "existing" : "created",
        });
      });
      currentClassSnapshots.forEach((snapshot, index) => {
        const classRef = classRefs[index];
        const previous = snapshot.data() ?? {};
        const added = rows.filter((row) => row.classId === snapshot.id).length;
        transaction.set(classRef, {
          experimentId,
          classId: snapshot.id,
          allocationQueue: previous.allocationQueue ?? [],
          nextBlockNumber: Math.floor((Number(previous.allocatedCount ?? 0) + added) / 4) + 1,
          allocatedCount: Number(previous.allocatedCount ?? 0) + added,
          updatedAt: timestamp,
        }, { merge: true });
      });
      transaction.update(experimentRef, {
        rosterSize: Number(currentExperiment.data()?.rosterSize ?? 0) + rows.length,
        updatedAt: timestamp,
      });
      transaction.create(db.collection("auditLogs").doc(), {
        action: options.auditAction ?? "experiment.participants_imported",
        experimentId,
        researcherId: principal.uid,
        count: rows.length,
        createdAt: timestamp,
      });
      return { enrollments, credentials };
    });
    const result = {
      ...created,
      credentialsCsv: credentialsCsv(created.credentials),
    };
    if (markerRef) {
      await markerRef.update({ status: "completed", enrollmentCount: result.enrollments.length, completedAt: now() }).catch(() => undefined);
    }
    return result;
  } catch (error) {
    await Promise.all(createdUsers.map((user) => adminAuth().deleteUser(user.uid).catch(() => undefined)));
    if (markerRef) await markerRef.delete().catch(() => undefined);
    throw error;
  }
}
