import { TechnicalFailureError } from "@/lib/study/technical-failure";

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
