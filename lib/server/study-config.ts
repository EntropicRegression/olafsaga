import "server-only";

import { randomBytes } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import {
  STUDY_CONFIG_VERSION,
  VOCABULARY_VERSION,
  resolveStudyThresholds,
} from "@/lib/study/config";
import type { StudyThresholds } from "@/lib/study/types";

const now = () => new Date().toISOString();

export interface ActiveStudyConfig {
  configVersion: string;
  vocabularyVersion: string;
  thresholds: StudyThresholds;
  updatedAt: string | null;
  updatedBy: string | null;
  changeNote: string | null;
}

export async function getActiveStudyConfig(): Promise<ActiveStudyConfig> {
  const snapshot = await adminDb()
    .collection("studyMetadata")
    .doc("current")
    .get();
  const data = snapshot.data();
  return {
    configVersion: String(data?.configVersion ?? STUDY_CONFIG_VERSION),
    vocabularyVersion: String(data?.vocabularyVersion ?? VOCABULARY_VERSION),
    thresholds: resolveStudyThresholds(data?.thresholds),
    updatedAt: data?.updatedAt ? String(data.updatedAt) : null,
    updatedBy: data?.updatedBy ? String(data.updatedBy) : null,
    changeNote: data?.changeNote ? String(data.changeNote) : null,
  };
}

export async function getActiveVocabularyVersion(): Promise<string> {
  return (await getActiveStudyConfig()).vocabularyVersion;
}

export async function publishStudyConfigVersion(
  thresholds: StudyThresholds,
  changeNote: string,
  researcherId: string,
) {
  const db = adminDb();
  const createdAt = now();
  const stamp = createdAt.replace(/\D/g, "").slice(0, 14);
  const version = `study-${stamp}-${randomBytes(2).toString("hex")}`;
  const configRef = db.collection("studyConfigs").doc(version);
  const metadataRef = db.collection("studyMetadata").doc("current");
  await db.runTransaction(async (transaction) => {
    transaction.create(configRef, {
      version,
      thresholds,
      changeNote,
      createdBy: researcherId,
      createdAt,
      immutable: true,
    });
    transaction.set(
      metadataRef,
      {
        configVersion: version,
        thresholds,
        changeNote,
        updatedBy: researcherId,
        updatedAt: createdAt,
      },
      { merge: true },
    );
    transaction.set(db.collection("auditLogs").doc(), {
      action: "study_config.published",
      configVersion: version,
      thresholds,
      changeNote,
      researcherId,
      createdAt,
    });
  });
  return { configVersion: version, thresholds, changeNote, createdAt };
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
  const active = await getActiveStudyConfig();
  const createdAt = now();
  const vocabularyRef = db
    .collection("studyConfigs")
    .doc(active.configVersion)
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
      configVersion: active.configVersion,
      createdBy: researcherId,
      createdAt,
      immutable: true,
    });
    transaction.set(
      db.collection("studyMetadata").doc("current"),
      {
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
