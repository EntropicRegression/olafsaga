import { z } from "zod";
import { importParticipants } from "@/lib/server/admin";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";

const requestSchema = z.object({
  participants: z
    .array(
      z.object({
        code: z.string().min(3).max(40),
        password: z.string().min(8).max(128),
        classId: z.string().min(1).max(80),
        consentVersion: z.string().min(1).max(80),
        consentedAt: z.string().datetime(),
      }),
    )
    .min(1)
    .max(200),
});

export async function POST(request: Request) {
  try {
    const principal = await requireResearcher(request);
    const body = requestSchema.parse(await request.json());
    return Response.json({
      results: await importParticipants(body.participants, principal.uid),
    });
  } catch (error) {
    return apiError(error);
  }
}
