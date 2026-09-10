import "server-only";

import { randomBytes } from "node:crypto";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { AuthError, type Principal } from "./auth";
import { HttpError } from "./http";

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generatePassword(): string {
  const bytes = randomBytes(14);
  const body = Array.from(bytes, (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]).join("");
  return `O${body}7!`;
}

function assertResearcher(principal: Principal): void {
  if (principal.role !== "researcher") {
    throw new AuthError("Researcher access is required.", 403);
  }
}

export async function rotateParticipantPassword(
  principal: Principal,
  participantId: string,
  requestedPassword?: string,
): Promise<{ participantId: string; participantCode: string; password: string }> {
  assertResearcher(principal);
  if (!participantId.trim()) throw new HttpError("Participant id is required.", 400);
  if (requestedPassword && requestedPassword.length < 8) {
    throw new HttpError("Password must be at least 8 characters.", 400);
  }
  const db = adminDb();
  const participantRef = db.collection("participants").doc(participantId);
  const participantSnapshot = await participantRef.get();
  if (!participantSnapshot.exists || participantSnapshot.data()?.role !== "student") {
    throw new AuthError("Participant was not found.", 404);
  }
  const password = requestedPassword ?? generatePassword();
  await adminAuth().updateUser(participantId, { password, disabled: false });
  const rotatedAt = new Date().toISOString();
  await db.collection("auditLogs").add({
    action: "participant.password_rotated",
    participantId,
    participantCode: String(participantSnapshot.data()?.code ?? ""),
    researcherId: principal.uid,
    rotatedAt,
  });
  return {
    participantId,
    participantCode: String(participantSnapshot.data()?.code ?? ""),
    password,
  };
}
