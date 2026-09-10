import {
  createResearchExport,
  getResearchExport,
} from "@/lib/server/admin";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const exportSchema = z.object({
  experimentId: z.string().trim().min(1),
});

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
    const body = await request.json().catch(() => ({}));
    const { experimentId } = exportSchema.parse(body);
    return Response.json(await createResearchExport(principal.uid, experimentId));
  } catch (error) {
    return apiError(error);
  }
}
