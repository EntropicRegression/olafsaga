import {
  archiveExperimentInStore,
} from "@/lib/server/experiment-repository";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ experimentId: string }> },
) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) {
      return Response.json(
        { error: "Demo experiments are not written to Firestore." },
        { status: 409 },
      );
    }
    const { experimentId } = await context.params;
    return Response.json({ experiment: await archiveExperimentInStore(principal, experimentId) });
  } catch (error) {
    return apiError(error);
  }
}
