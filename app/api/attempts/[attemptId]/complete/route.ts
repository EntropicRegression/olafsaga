import { z } from "zod";
import { evaluateAttempt } from "@/lib/study/evaluator";
import { resolveStudyThresholds } from "@/lib/study/config";
import type {
  AttemptInput,
  ExperimentGroup,
  NodeId,
  RoundType,
} from "@/lib/study/types";
import { requirePrincipal } from "@/lib/server/auth";
import { evaluateSemanticWithProvider } from "@/lib/server/azure-openai";
import { evaluateEmotionWithProvider } from "@/lib/server/emotion";
import { apiError, HttpError } from "@/lib/server/http";
import {
  failureFromError,
  normalizeTechnicalDetail,
  TechnicalFailureError,
  TECHNICAL_FAILURE_CODES,
} from "@/lib/study/technical-failure";
import {
  assertAudioUploaded,
  finalizeAttempt,
  getAttempt,
  getSession,
  markAttemptAnalyzing,
  markAttemptTechnicalFailure,
} from "@/lib/server/repository";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  sessionId: z.string().min(1),
  transcript: z.string().max(4000).default(""),
  durationMs: z.number().int().min(0).max(121_000).default(0),
  technicalError: z.string().min(1).max(1000).optional(),
  technicalErrorCode: z.enum(TECHNICAL_FAILURE_CODES).optional(),
  speechScores: z.object({
    accuracy: z.number().min(0).max(100).nullable(),
    fluency: z.number().min(0).max(100).nullable(),
    prosody: z.number().min(0).max(100).nullable(),
    monotone: z.boolean(),
    raw: z.unknown().optional(),
  }),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ attemptId: string }> },
) {
  try {
    const principal = await requirePrincipal(request);
    if (principal.demo) {
      return Response.json(
        { error: "Demo attempts are evaluated in the browser." },
        { status: 409 },
      );
    }
    const body = requestSchema.parse(await request.json());
    const { attemptId } = await context.params;
    const attempt = await getAttempt(principal, body.sessionId, attemptId);
    const thresholds = resolveStudyThresholds(attempt.thresholds);
    if (body.durationMs > thresholds.maximumRecordingSeconds * 1000 + 1000) {
      throw new HttpError(
        `Recording exceeds the ${thresholds.maximumRecordingSeconds}-second study limit.`,
        400,
      );
    }
    const retryableTechnicalFailure =
      attempt.status === "technical_error" &&
      (attempt.technicalFailure as { retryable?: unknown } | undefined)
        ?.retryable === true;
    const terminal = [
      "passed",
      "failed",
      "forced_advance",
    ].includes(String(attempt.status)) ||
      (attempt.status === "technical_error" && !retryableTechnicalFailure);
    if (terminal) {
      return Response.json({
        result: attempt,
        session: await getSession(principal, body.sessionId),
        idempotent: true,
      });
    }

    const input: AttemptInput = {
      attemptId,
      sessionId: body.sessionId,
      participantId: principal.uid,
      group: attempt.group as ExperimentGroup,
      nodeId: Number(attempt.nodeId) as NodeId,
      round: attempt.round as RoundType,
      attemptNumber: Number(attempt.attemptNumber),
      transcript: body.transcript,
      durationMs: body.durationMs,
      audioPath: String(attempt.storagePath),
      speechScores: body.speechScores,
      technicalError: body.technicalError,
      technicalErrorCode: body.technicalErrorCode,
    };

    if (body.technicalError) {
      await markAttemptAnalyzing(body.sessionId, attemptId, input);
      const result = evaluateAttempt(input, {}, thresholds);
      const session = await finalizeAttempt(principal, input, result);
      return Response.json({ result, session });
    }

    await assertAudioUploaded(String(attempt.storagePath));
    await markAttemptAnalyzing(body.sessionId, attemptId, input);

    try {
      const semantic = await evaluateSemanticWithProvider(
        input.transcript,
        input.nodeId,
        input.round,
      );
      const emotion =
        input.group === "agent2"
          ? await evaluateEmotionWithProvider(
              String(attempt.storagePath),
              input.nodeId,
              thresholds,
            )
          : null;
      const result = evaluateAttempt(input, { semantic, emotion }, thresholds);
      const session = await finalizeAttempt(principal, input, result);
      return Response.json({ result, session });
    } catch (providerError) {
      const normalizedError =
        providerError instanceof TechnicalFailureError
          ? providerError
          : new TechnicalFailureError(
              "ANALYSIS_FAILED",
              providerError instanceof Error
                ? providerError.message
                : "Provider analysis failed.",
              { cause: providerError },
            );
      const failure = failureFromError(normalizedError);
      await markAttemptTechnicalFailure(
        body.sessionId,
        attemptId,
        input,
        failure,
        normalizeTechnicalDetail(normalizedError.technicalDetail),
      );
      console.error("Attempt provider analysis failed.", {
        attemptId,
        stage: failure.stage,
        code: failure.code,
        detail: normalizeTechnicalDetail(normalizedError.technicalDetail),
      });
      return apiError(normalizedError);
    }
  } catch (error) {
    return apiError(error);
  }
}
