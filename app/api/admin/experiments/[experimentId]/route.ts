import { z } from "zod";
import {
  getExperiment,
  getExperimentReadiness,
  listEnrollments,
  updateExperiment,
} from "@/lib/server/experiment-repository";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  mode: z.enum(["test", "formal"]),
  consentVersion: z.string().trim().min(1).max(80),
  participantCodePrefix: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ experimentId: string }> },
) {
  try {
    const principal = await requireResearcher(request);
    const { experimentId } = await context.params;
    return Response.json({
      experiment: await getExperiment(principal, experimentId),
      enrollments: await listEnrollments(principal, experimentId),
      readiness: await getExperimentReadiness(principal, experimentId),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
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
    return Response.json({
      experiment: await updateExperiment(
        principal,
        experimentId,
        updateSchema.parse(await request.json()),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
