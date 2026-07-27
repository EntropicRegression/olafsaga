import "server-only";

import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function serviceAccountFromEnvironment() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) return null;
  try {
    return JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as Record<string, string>;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64 JSON.");
  }
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
}

export function getFirebaseAdminApp(): App {
  if (getApps().length) return getApp();
  const serviceAccount = serviceAccountFromEnvironment();
  return initializeApp({
    credential: serviceAccount
      ? cert(serviceAccount)
      : applicationDefault(),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

export function adminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function adminDb() {
  return getFirestore(getFirebaseAdminApp());
}

export function adminBucket() {
  return getStorage(getFirebaseAdminApp()).bucket();
}
