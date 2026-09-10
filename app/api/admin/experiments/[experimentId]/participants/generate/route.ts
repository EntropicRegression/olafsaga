import { z } from "zod";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { createExperimentEnrollments } from "@/lib/server/experiment-enrollment";

export const runtime = "nodejs";

const requestSchema = z.object({
  count: z.number().int().min(1).max(200),
  classId: z.string().trim().min(1).max(80),
  consentVersion: z.string().trim().max(80).optional(),
  consentedAt: z.string().trim().max(80).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ experimentId: string }> },
) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) {
      return Response.json({ error: "Demo experiments are not written to Firestore." }, { status: 409 });
    }
    const { experimentId } = await context.params;
    const body = requestSchema.parse(await request.json());
    const result = await createExperimentEnrollments(
      principal,
      experimentId,
      Array.from({ length: body.count }, () => ({
        classId: body.classId,
        consentVersion: body.consentVersion,
        consentedAt: body.consentedAt,
      })),
      request.headers.get("idempotency-key") ?? undefined,
      { auditAction: "experiment.participants_generated" },
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
