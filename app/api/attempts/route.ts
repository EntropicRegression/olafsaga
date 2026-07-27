import { z } from "zod";
import { requirePrincipal } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { createAttempt } from "@/lib/server/repository";

export const runtime = "nodejs";

const requestSchema = z.object({
  sessionId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const principal = await requirePrincipal(request);
    const body = requestSchema.parse(await request.json());
    if (principal.demo) {
      return Response.json(
        { error: "Demo attempts are stored in the browser." },
        { status: 409 },
      );
    }
    return Response.json(await createAttempt(principal, body.sessionId));
  } catch (error) {
    return apiError(error);
  }
}
