import {
  createResearchExport,
  getResearchExport,
} from "@/lib/server/admin";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) {
      return Response.json(
        { error: "Cloud export requires Firebase configuration." },
        { status: 409 },
      );
    }
    const exportId = new URL(request.url).searchParams.get("exportId");
    if (!exportId) {
      return Response.json({ error: "exportId is required." }, { status: 400 });
    }
    return Response.json(await getResearchExport(exportId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) {
      return Response.json(
        { error: "Cloud export requires Firebase configuration." },
        { status: 409 },
      );
    }
    return Response.json(await createResearchExport(principal.uid));
  } catch (error) {
    return apiError(error);
  }
}
