import { z } from "zod";
import {
  deleteAudioObject,
  getAudioSignedUrl,
} from "@/lib/server/admin";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";

const deleteSchema = z.object({ path: z.string().min(1) });

export async function GET(request: Request) {
  try {
    const principal = await requireResearcher(request);
    const path = new URL(request.url).searchParams.get("path");
    if (!path) {
      return Response.json({ error: "path is required." }, { status: 400 });
    }
    return Response.json(await getAudioSignedUrl(path, principal.uid));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const principal = await requireResearcher(request);
    const body = deleteSchema.parse(await request.json());
    await deleteAudioObject(body.path, principal.uid);
    return Response.json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
