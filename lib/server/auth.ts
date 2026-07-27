import "server-only";

import { adminAuth, adminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import type { ExperimentGroup } from "@/lib/study/types";

export interface Principal {
  uid: string;
  code: string;
  classId: string;
  role: "student" | "researcher";
  group: ExperimentGroup | null;
  consentVersion: string | null;
  demo: boolean;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 401,
  ) {
    super(message);
  }
}

function demoPrincipal(request: Request): Principal | null {
  const demoCode = request.headers.get("x-demo-user");
  if (
    process.env.NEXT_PUBLIC_DEMO_MODE !== "true" ||
    !demoCode ||
    isFirebaseAdminConfigured()
  ) {
    return null;
  }
  const isResearcher = demoCode.toLowerCase().includes("researcher");
  return {
    uid: `demo-${demoCode.toLowerCase()}`,
    code: demoCode,
    classId: "demo-class",
    role: isResearcher ? "researcher" : "student",
    group: demoCode.endsWith("2") ? "agent2" : "agent1",
    consentVersion: "demo-consent-v1",
    demo: true,
  };
}

export async function requirePrincipal(request: Request): Promise<Principal> {
  const demo = demoPrincipal(request);
  if (demo) return demo;

  if (!isFirebaseAdminConfigured()) {
    throw new AuthError("Firebase Admin is not configured.", 503);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new AuthError("A Firebase ID token is required.");
  }

  const decoded = await adminAuth().verifyIdToken(authorization.slice(7));
  const participant = await adminDb().collection("participants").doc(decoded.uid).get();
  if (!participant.exists) {
    throw new AuthError("Participant profile was not found.", 403);
  }
  const data = participant.data()!;
  return {
    uid: decoded.uid,
    code: String(data.code ?? ""),
    classId: String(data.classId ?? ""),
    role: data.role === "researcher" ? "researcher" : "student",
    group:
      data.group === "agent1" || data.group === "agent2" ? data.group : null,
    consentVersion: data.consentVersion
      ? String(data.consentVersion)
      : null,
    demo: false,
  };
}

export async function requireResearcher(request: Request): Promise<Principal> {
  const principal = await requirePrincipal(request);
  if (principal.role !== "researcher") {
    throw new AuthError("Researcher access is required.", 403);
  }
  return principal;
}
