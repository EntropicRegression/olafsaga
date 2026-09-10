import { z } from "zod";
import {
  createExperiment,
  listExperiments,
} from "@/lib/server/experiment-repository";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";

const createSchema = z.object({
  code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/),
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

export async function GET(request: Request) {
  try {
    return Response.json({ experiments: await listExperiments(await requireResearcher(request)) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) {
      return Response.json(
        { error: "Demo experiments are not written to Firestore." },
        { status: 409 },
      );
    }
    return Response.json(
      { experiment: await createExperiment(principal, createSchema.parse(await request.json())) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
