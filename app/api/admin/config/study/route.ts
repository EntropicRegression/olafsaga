import { z } from "zod";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import {
  getActiveStudyConfig,
  publishStudyConfigVersion,
} from "@/lib/server/study-config";

export const runtime = "nodejs";

const thresholdSchema = z.object({
  minimumWordCount: z.number().int().min(1).max(50),
  accuracy: z.number().min(0).max(100),
  fluency: z.number().min(0).max(100),
  emotionMinimumScore: z.number().min(0).max(1),
  emotionMaximumRank: z.number().int().min(1).max(10),
  maximumAttempts: z.number().int().min(1).max(10),
  maximumRecordingSeconds: z.number().int().min(5).max(120),
});

const requestSchema = z.object({
  thresholds: thresholdSchema,
  changeNote: z.string().trim().min(5).max(300),
});

export async function GET(request: Request) {
  try {
    await requireResearcher(request);
    return Response.json(await getActiveStudyConfig());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) {
      return Response.json(
        { error: "Demo settings are not written to Firestore." },
        { status: 409 },
      );
    }
    const body = requestSchema.parse(await request.json());
    return Response.json(
      await publishStudyConfigVersion(
        body.thresholds,
        body.changeNote,
        principal.uid,
      ),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
