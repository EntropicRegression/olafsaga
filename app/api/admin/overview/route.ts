import { getAdminOverview } from "@/lib/server/admin";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

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
    return Response.json(await getAdminOverview());
  } catch (error) {
    return apiError(error);
  }
}
