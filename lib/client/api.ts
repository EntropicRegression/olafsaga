"use client";

import { getIdToken } from "@/lib/firebase/client";
import {
  isTechnicalFailureCode,
  TechnicalFailureError,
} from "@/lib/study/technical-failure";

/** Longest server route is 60 seconds; a request that outlives this is lost. */
const REQUEST_TIMEOUT_MS = 75_000;

export class ApiClientError extends TechnicalFailureError {
  constructor(
    code: ConstructorParameters<typeof TechnicalFailureError>[0],
    readonly status: number,
    technicalDetail?: string,
  ) {
    super(code, technicalDetail);
    this.name = "ApiClientError";
  }
}

/**
 * The server answered, but with an error that is not a provider failure:
 * a rejected request (4xx) or a crashed or timed-out function (5xx).
 */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Machine-readable reason from the server, e.g. "ATTEMPT_STALE". */
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  demoCode?: string,
): Promise<T> {
  const token = await getIdToken();
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (demoCode) headers.set("x-demo-user", demoCode);
  const response = await fetch(path, {
    ...options,
    headers,
    signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  // A platform timeout or crash page is HTML, not the JSON the routes send.
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string; code?: unknown })
    | null;
  if (!response.ok) {
    if (isTechnicalFailureCode(payload?.code)) {
      throw new ApiClientError(payload.code, response.status, payload.error);
    }
    throw new ApiRequestError(
      payload?.error ?? `Request failed with ${response.status}.`,
      response.status,
      typeof payload?.code === "string" ? payload.code : undefined,
    );
  }
  if (payload === null) {
    throw new ApiRequestError("The server sent an unreadable response.", 502);
  }
  return payload;
}
