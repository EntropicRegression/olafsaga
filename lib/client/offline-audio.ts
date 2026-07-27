"use client";

import type { SpeechScores } from "@/lib/study/types";

const DB_NAME = "olaf-adventure-diary";
const DB_VERSION = 1;
const STORE = "pending-audio";

export interface PendingAudio {
  id: string;
  blob: Blob;
  storagePath: string;
  metadata: Record<string, string>;
  analysis?: {
    transcript: string;
    durationMs: number;
    speechScores: SpeechScores;
  };
  createdAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePendingAudio(audio: PendingAudio): Promise<void> {
  await transaction("readwrite", (store) => store.put(audio));
}

export async function deletePendingAudio(id: string): Promise<void> {
  await transaction("readwrite", (store) => store.delete(id));
}

export async function listPendingAudio(): Promise<PendingAudio[]> {
  return transaction("readonly", (store) => store.getAll());
}
