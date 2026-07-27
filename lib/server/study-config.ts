import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import {
  STUDY_CONFIG_VERSION,
  VOCABULARY_VERSION,
} from "@/lib/study/config";

const now = () => new Date().toISOString();

export async function getActiveVocabularyVersion(): Promise<string> {
  const snapshot = await adminDb()
    .collection("studyMetadata")
    .doc("current")
    .get();
  return String(snapshot.data()?.vocabularyVersion ?? VOCABULARY_VERSION);
}

export async function publishVocabularyVersion(
  version: string,
  rawWords: string[],
  researcherId: string,
) {
  const words = Array.from(
    new Set(
      rawWords
        .map((word) => word.normalize("NFKC").trim().toLowerCase())
        .filter((word) => /^[a-z]+(?:['-][a-z]+)*$/.test(word)),
    ),
  ).sort();
  if (words.length < 100) {
    throw new Error("Vocabulary files must contain at least 100 valid English words.");
  }

  const db = adminDb();
  const createdAt = now();
  const vocabularyRef = db
    .collection("studyConfigs")
    .doc(STUDY_CONFIG_VERSION)
    .collection("vocabularies")
    .doc(version);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(vocabularyRef);
    if (existing.exists) {
      throw new Error("This vocabulary version already exists and is immutable.");
    }
    transaction.set(vocabularyRef, {
      version,
      words,
      wordCount: words.length,
      configVersion: STUDY_CONFIG_VERSION,
      createdBy: researcherId,
      createdAt,
      immutable: true,
    });
    transaction.set(
      db.collection("studyMetadata").doc("current"),
      {
        configVersion: STUDY_CONFIG_VERSION,
        vocabularyVersion: version,
        updatedBy: researcherId,
        updatedAt: createdAt,
      },
      { merge: true },
    );
    transaction.set(db.collection("auditLogs").doc(), {
      action: "vocabulary.published",
      vocabularyVersion: version,
      wordCount: words.length,
      researcherId,
      createdAt,
    });
  });
  return { version, wordCount: words.length, createdAt };
}
