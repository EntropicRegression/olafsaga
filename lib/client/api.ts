"use client";

import { getIdToken } from "@/lib/firebase/client";

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
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with ${response.status}.`);
  }
  return payload;
}
