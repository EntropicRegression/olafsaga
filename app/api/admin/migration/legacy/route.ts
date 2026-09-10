import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { inspectLegacyMigration, migrateLegacyRecords } from "@/lib/server/experiment-migration";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) return Response.json({ error: "Demo mode has no legacy Firestore records." }, { status: 409 });
    return Response.json(await inspectLegacyMigration(principal));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) return Response.json({ error: "Demo mode has no legacy Firestore records." }, { status: 409 });
    return Response.json(await migrateLegacyRecords(principal));
  } catch (error) {
    return apiError(error);
  }
}
