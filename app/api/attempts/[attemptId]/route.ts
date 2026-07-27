import { requirePrincipal } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { getAttempt } from "@/lib/server/repository";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ attemptId: string }> },
) {
  try {
    const principal = await requirePrincipal(request);
    const { attemptId } = await context.params;
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return Response.json({ error: "sessionId is required." }, { status: 400 });
    }
    const attempt = await getAttempt(principal, sessionId, attemptId);
    return Response.json({ attempt });
  } catch (error) {
    return apiError(error);
  }
}
