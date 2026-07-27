import "server-only";

import { GoogleAuth } from "google-auth-library";

function credentialsFromEnvironment(): Record<string, string> | undefined {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) return undefined;
  try {
    return JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as Record<string, string>;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64 JSON.");
  }
}

export function getGoogleAuth(scopes?: string[]): GoogleAuth {
  const credentials = credentialsFromEnvironment();
  return new GoogleAuth({
    ...(credentials ? { credentials } : {}),
    ...(scopes ? { scopes } : {}),
  });
}
