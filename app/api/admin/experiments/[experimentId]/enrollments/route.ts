import { z } from "zod";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { createExperimentEnrollments } from "@/lib/server/experiment-enrollment";
import { parseCsvRecords } from "@/lib/study/csv";
import { HttpError } from "@/lib/server/http";

export const runtime = "nodejs";

const rowSchema = z.object({
  participantCode: z.string().trim().optional(),
  classId: z.string().trim().min(1).max(80),
  consentVersion: z.string().trim().max(80).optional(),
  consentedAt: z.string().trim().max(80).optional(),
});

const requestSchema = z.object({
  rows: z.array(rowSchema).min(1).max(500).optional(),
  csv: z.string().max(500_000).optional(),
}).refine((value) => Boolean(value.rows || value.csv), {
  message: "Either rows or csv is required.",
});

export async function POST(
  request: Request,
  context: { params: Promise<{ experimentId: string }> },
) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) {
      return Response.json(
        { error: "Demo experiments are not written to Firestore." },
        { status: 409 },
      );
    }
    const { experimentId } = await context.params;
    const body = requestSchema.parse(await request.json());
    let rows = body.rows;
    if (!rows && body.csv) {
      try {
        rows = parseCsvRecords(body.csv).map((record) => ({
          participantCode: record.participantCode,
          classId: record.classId,
          consentVersion: record.consentVersion,
          consentedAt: record.consentedAt,
        }));
      } catch (error) {
        throw new HttpError(error instanceof Error ? error.message : "Invalid roster CSV.", 400);
      }
    }
    if (!rows) throw new HttpError("No enrollment rows were provided.", 400);
    const result = await createExperimentEnrollments(
      principal,
      experimentId,
      rows,
      request.headers.get("idempotency-key") ?? undefined,
      { auditAction: "experiment.participants_imported" },
    );
    return Response.json({
      experimentId,
      enrollmentCount: result.enrollments.length,
      credentials: result.credentials,
      credentialsCsv: result.credentialsCsv,
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
