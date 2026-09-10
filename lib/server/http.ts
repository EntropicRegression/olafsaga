import { ZodError } from "zod";
import { AuthError } from "./auth";
import {
  failureFromError,
  TechnicalFailureError,
  type TechnicalFailureCode,
} from "@/lib/study/technical-failure";

export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function technicalFailureStatus(code: TechnicalFailureCode): number {
  if (code.endsWith("RATE_LIMITED")) return 429;
  if (code.endsWith("TIMEOUT")) return 504;
  return 503;
}

export function apiError(error: unknown): Response {
  if (error instanceof TechnicalFailureError) {
    const failure = failureFromError(error);
    return Response.json(
      { error: failure.userMessage, ...failure },
      { status: technicalFailureStatus(failure.code) },
    );
  }
  if (error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: "Invalid request.", issues: error.issues },
      { status: 400 },
    );
  }
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";
  return Response.json({ error: message }, { status: 500 });
}
