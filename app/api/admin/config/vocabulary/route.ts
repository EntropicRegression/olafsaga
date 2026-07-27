import { z } from "zod";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import {
  getActiveVocabularyVersion,
  publishVocabularyVersion,
} from "@/lib/server/study-config";

export const runtime = "nodejs";

const requestSchema = z.object({
  version: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
  words: z.array(z.string().max(80)).min(100).max(5000),
});

export async function GET(request: Request) {
  try {
    await requireResearcher(request);
    return Response.json({
      vocabularyVersion: await getActiveVocabularyVersion(),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) {
      return Response.json(
        { error: "Demo vocabulary is not written to Firestore." },
        { status: 409 },
      );
    }
    const body = requestSchema.parse(await request.json());
    return Response.json(
      await publishVocabularyVersion(
        body.version,
        body.words,
        principal.uid,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
