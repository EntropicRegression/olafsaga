"use client";

import { getIdToken } from "@/lib/firebase/client";
import {
  isTechnicalFailureCode,
  TechnicalFailureError,
} from "@/lib/study/technical-failure";

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
  const response = await fetch(path, { ...options, headers });
  const payload = (await response.json()) as T & {
    error?: string;
    code?: unknown;
  };
  if (!response.ok) {
    if (isTechnicalFailureCode(payload.code)) {
      throw new ApiClientError(payload.code, response.status, payload.error);
    }
    throw new Error(payload.error ?? `Request failed with ${response.status}.`);
  }
  return payload;
}
