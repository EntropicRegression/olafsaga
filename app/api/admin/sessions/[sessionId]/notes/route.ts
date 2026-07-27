import { z } from "zod";
import { addResearchNote } from "@/lib/server/admin";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) {
      return Response.json(
        { error: "Demo notes are not written to the cloud." },
        { status: 409 },
      );
    }
    const { sessionId } = await context.params;
    const body = requestSchema.parse(await request.json());
    return Response.json({
      note: await addResearchNote(sessionId, body.text, principal.uid),
    });
  } catch (error) {
    return apiError(error);
  }
}
