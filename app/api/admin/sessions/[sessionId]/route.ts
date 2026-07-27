import { getAdminSessionDetail } from "@/lib/server/admin";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    await requireResearcher(request);
    const { sessionId } = await context.params;
    return Response.json(await getAdminSessionDetail(sessionId));
  } catch (error) {
    return apiError(error);
  }
}
