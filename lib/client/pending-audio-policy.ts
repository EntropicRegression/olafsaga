import { TechnicalFailureError } from "@/lib/study/technical-failure";
import type { PendingAudio } from "@/lib/client/offline-audio";

const TERMINAL_SYNC_STAGES = new Set(["semantic", "emotion", "analysis"]);

/** Request rejections that a later, identical request can still get past. */
const TRANSIENT_REQUEST_STATUSES = new Set([401, 408, 429]);

/**
 * Storage refused the recording itself (too large, wrong type), so sending the
 * same file again can never succeed.
 */
export class RecordingRejectedError extends Error {
  constructor(options?: ErrorOptions) {
    super("這段錄音無法上傳，請再錄一次。", options);
    this.name = "RecordingRejectedError";
  }
}

function requestStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return undefined;
  }
  return typeof error.status === "number" ? error.status : undefined;
}

/**
 * Decides whether a failed submission stays in the offline queue.
 *
 * Transfer failures can recover without asking the student to record again.
 * Everything the same request can never get past must leave the queue,
 * because a queued recording keeps the microphone disabled:
 * - the server accepted the audio and analysis failed (the attempt is not
 *   consumed, the student simply records again);
 * - the server rejected the request (4xx): the attempt is stale, the session
 *   is gone, the upload is missing;
 * - Storage rejected the file.
 */
export function shouldRetainPendingAudio(error: unknown): boolean {
  if (error instanceof RecordingRejectedError) return false;
  if (error instanceof TechnicalFailureError) {
    return !TERMINAL_SYNC_STAGES.has(error.failure.stage);
  }
  const status = requestStatus(error);
  if (status !== undefined && status >= 400 && status < 500) {
    return TRANSIENT_REQUEST_STATUSES.has(status);
  }
  return true;
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
