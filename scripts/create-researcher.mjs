import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const [codeArgument, password] = process.argv.slice(2);
const code = codeArgument?.trim().toUpperCase();
if (!code || !password) {
  console.error(
    "Usage: npm run bootstrap:researcher -- RESEARCHER-01 'StrongPassword'",
  );
  process.exit(1);
}
if (password.length < 12) {
  console.error("The researcher password must contain at least 12 characters.");
  process.exit(1);
}

const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!encoded) {
  console.error("FIREBASE_SERVICE_ACCOUNT_BASE64 is required.");
  process.exit(1);
}

const serviceAccount = JSON.parse(
  Buffer.from(encoded, "base64").toString("utf8"),
);
const app = initializeApp({
  credential: cert(serviceAccount),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});
const auth = getAuth(app);
const db = getFirestore(app);
const slug = code.toLowerCase().replace(/[^a-z0-9-]/g, "-");
const email = `${slug}@participants.olaf.study`;

let user;
try {
  user = await auth.getUserByEmail(email);
  user = await auth.updateUser(user.uid, {
    password,
    disabled: false,
    displayName: code,
  });
} catch (error) {
  if (error?.code !== "auth/user-not-found") throw error;
  user = await auth.createUser({
    email,
    password,
    emailVerified: true,
    displayName: code,
  });
}

const createdAt = new Date().toISOString();
await db.collection("participants").doc(user.uid).set(
  {
    code,
    classId: "research",
    role: "researcher",
    group: null,
    consentVersion: "researcher",
    consentedAt: createdAt,
    updatedAt: createdAt,
  },
  { merge: true },
);
await db.collection("auditLogs").add({
  action: "researcher.bootstrapped",
  researcherId: user.uid,
  code,
  createdAt,
});

console.log(`Researcher account ${code} is ready (${user.uid}).`);
