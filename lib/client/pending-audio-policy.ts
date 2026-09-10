import { TechnicalFailureError } from "@/lib/study/technical-failure";
import type { PendingAudio } from "@/lib/client/offline-audio";

const TERMINAL_SYNC_STAGES = new Set(["semantic", "emotion", "analysis"]);

/**
 * Transfer failures can recover without asking the student to record again.
 * Once the server has accepted the audio and returned an analysis failure,
 * repeatedly submitting the same attempt only traps the UI in the sync queue.
 */
export function shouldRetainPendingAudio(error: unknown): boolean {
  if (!(error instanceof TechnicalFailureError)) return true;
  return !TERMINAL_SYNC_STAGES.has(error.failure.stage);
}

export function selectPendingAudioForRetry(
  pendingAudio: PendingAudio[],
  sessionId: string,
  suppressedIds: ReadonlySet<string>,
  foregroundIds: ReadonlySet<string>,
): PendingAudio[] {
  return pendingAudio.filter(
    (item) =>
      item.metadata.sessionId === sessionId &&
      item.analysis &&
      !suppressedIds.has(item.id) &&
      !foregroundIds.has(item.id),
  );
}
