import { describe, expect, it, vi } from "vitest";
import type { PendingAudio } from "@/lib/client/offline-audio";
import {
  RecordingRejectedError,
  shouldRetainPendingAudio,
} from "@/lib/client/pending-audio-policy";
import { syncPendingAudio } from "@/lib/client/pending-audio-sync";
import { TechnicalFailureError } from "@/lib/study/technical-failure";

function pending(overrides: Partial<PendingAudio> = {}): PendingAudio {
  return {
    id: "attempt-1",
    blob: new Blob(["wav"]),
    storagePath: "audio/uid/session-1/1-plot-attempt-1.wav",
    metadata: { sessionId: "session-1" },
    createdAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    markUploaded: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue({ ok: true }),
    isOnline: () => true,
    ...overrides,
  };
}

/** What Firebase Storage throws when its rules refuse a write. */
const storageRefusal = Object.assign(new Error("User does not have permission"), {
  code: "storage/unauthorized",
});
const requestError = (status: number, code?: string) =>
  Object.assign(new Error(`HTTP ${status}`), { status, code });

describe("syncPendingAudio", () => {
  it("uploads, remembers the upload, then completes", async () => {
    const deps = dependencies();

    await expect(syncPendingAudio(pending(), deps)).resolves.toEqual({ ok: true });

    expect(deps.upload).toHaveBeenCalledOnce();
    expect(deps.markUploaded).toHaveBeenCalledOnce();
    expect(deps.complete).toHaveBeenCalledOnce();
  });

  it("does not upload again once the WAV is in Storage", async () => {
    const deps = dependencies();

    await syncPendingAudio(pending({ uploaded: true }), deps);

    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.complete).toHaveBeenCalledOnce();
  });

  it("completes when Storage refuses to overwrite an earlier upload", async () => {
    // The page was reloaded after the upload but before the answer arrived:
    // the queue item has no `uploaded` flag and Storage forbids overwrites.
    const deps = dependencies({
      upload: vi.fn().mockRejectedValue(storageRefusal),
    });

    await expect(syncPendingAudio(pending(), deps)).resolves.toEqual({ ok: true });
    expect(deps.complete).toHaveBeenCalledOnce();
  });

  it("gives up on a recording that Storage refused and the server never received", async () => {
    const deps = dependencies({
      upload: vi.fn().mockRejectedValue(storageRefusal),
      complete: vi.fn().mockRejectedValue(requestError(409, "UPLOAD_INCOMPLETE")),
    });

    const failure = await syncPendingAudio(pending(), deps).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(RecordingRejectedError);
    expect(shouldRetainPendingAudio(failure)).toBe(false);
  });

  it("keeps a recording whose upload was interrupted by the network", async () => {
    const deps = dependencies({
      upload: vi.fn().mockRejectedValue(new Error("Failed to fetch")),
      isOnline: () => false,
    });

    const failure = await syncPendingAudio(pending(), deps).catch(
      (error: unknown) => error,
    );

    expect((failure as TechnicalFailureError).failure.code).toBe("NETWORK_ERROR");
    expect(deps.complete).not.toHaveBeenCalled();
    expect(shouldRetainPendingAudio(failure)).toBe(true);
  });
});

describe("pending audio retry policy for request errors", () => {
  it.each([
    [409, "ATTEMPT_STALE"],
    [409, "UPLOAD_INCOMPLETE"],
    [403, undefined],
    [404, undefined],
    [400, undefined],
  ])("stops retrying a request the server rejected: %s %s", (status, code) => {
    expect(shouldRetainPendingAudio(requestError(status, code))).toBe(false);
  });

  it.each([401, 429, 500, 502, 504])(
    "keeps retrying a request that can still succeed: %s",
    (status) => {
      expect(shouldRetainPendingAudio(requestError(status))).toBe(true);
    },
  );
});
