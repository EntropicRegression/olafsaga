import { ZodError } from "zod";
import { AuthError } from "./auth";

export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function apiError(error: unknown): Response {
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
