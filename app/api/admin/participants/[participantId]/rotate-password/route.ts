import { z } from "zod";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { rotateParticipantPassword } from "@/lib/server/participant-provisioning";

export const runtime = "nodejs";

const requestSchema = z.object({
  password: z.string().min(8).max(128).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ participantId: string }> },
) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) {
      return Response.json({ error: "Demo participants are not written to Firebase." }, { status: 409 });
    }
    const { participantId } = await context.params;
    const body = requestSchema.parse(await request.json().catch(() => ({})));
    return Response.json(await rotateParticipantPassword(principal, participantId, body.password));
  } catch (error) {
    return apiError(error);
  }
}
