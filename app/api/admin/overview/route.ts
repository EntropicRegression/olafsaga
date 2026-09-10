import { getAdminOverview } from "@/lib/server/admin";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import type { OverviewScopeMode } from "@/lib/server/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) {
      return Response.json(
        { error: "The demo dashboard uses local fixture data." },
        { status: 409 },
      );
    }
    const searchParams = new URL(request.url).searchParams;
    const experimentId = searchParams.get("experimentId") ?? undefined;
    const requestedMode = searchParams.get("mode") ?? "formal";
    const mode: OverviewScopeMode =
      requestedMode === "all" || requestedMode === "test" ? requestedMode : "formal";
    return Response.json(await getAdminOverview(experimentId, mode));
  } catch (error) {
    return apiError(error);
  }
}
