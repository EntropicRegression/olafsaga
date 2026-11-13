import { TechnicalFailureError } from "@/lib/study/technical-failure";
import type { PendingAudio } from "@/lib/client/offline-audio";
import { RecordingRejectedError } from "@/lib/client/pending-audio-policy";

export interface PendingAudioSyncDependencies<Completion> {
  /** Uploads the WAV to its reserved Storage path. */
  upload: (item: PendingAudio) => Promise<void>;
  /** Records that the WAV is in Storage, so a later retry skips the upload. */
  markUploaded: (item: PendingAudio) => Promise<void>;
  /** Asks the server to analyze and commit the attempt. */
  complete: (item: PendingAudio) => Promise<Completion>;
  isOnline: () => boolean;
}

/**
 * Storage rules allow a recording to be created once and never overwritten.
 * A second upload to the same path is therefore refused with this code, as is
 * a file the rules reject outright.
 */
function isStorageRefusal(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "storage/unauthorized"
  );
}

function isUploadIncomplete(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "UPLOAD_INCOMPLETE"
  );
}

/**
 * Sends one recorded attempt: upload the WAV, then ask the server to complete
 * the attempt. Both the first submission and every queue retry run through
 * here, so a retry can resume from whichever step the last try reached.
 *
 * The upload is skipped once it has succeeded. If Storage refuses it, the
 * file is either already there (the previous try uploaded it but never saw
 * the answer) or unacceptable; the server knows which, so completion is
 * attempted and only its "upload missing" answer condemns the recording.
 */
export async function syncPendingAudio<Completion>(
  item: PendingAudio,
  dependencies: PendingAudioSyncDependencies<Completion>,
): Promise<Completion> {
  let refusal: unknown;
  if (!item.uploaded) {
    try {
      await dependencies.upload(item);
    } catch (error) {
      if (!isStorageRefusal(error)) {
        throw new TechnicalFailureError(
          dependencies.isOnline() ? "AUDIO_UPLOAD_FAILED" : "NETWORK_ERROR",
          error instanceof Error
            ? error.message
            : "Firebase Storage upload failed.",
          { cause: error },
        );
      }
      refusal = error;
    }
    if (!refusal) {
      // Best effort: without the flag the next retry is refused by Storage
      // and takes the path above.
      await dependencies.markUploaded(item).catch(() => undefined);
    }
  }

  try {
    return await dependencies.complete(item);
  } catch (error) {
    if (refusal && isUploadIncomplete(error)) {
      throw new RecordingRejectedError({ cause: refusal });
    }
    throw error;
  }
}
