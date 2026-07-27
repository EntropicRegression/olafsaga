import { z } from "zod";
import { requirePrincipal } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { reopenWorksheet } from "@/lib/server/repository";

export const runtime = "nodejs";

const requestSchema = z.object({
  sessionId: z.string().min(1),
  nodeId: z.number().int().min(1).max(5),
});

export async function POST(request: Request) {
  try {
    const principal = await requirePrincipal(request);
    const body = requestSchema.parse(await request.json());
    if (principal.demo) {
      return Response.json(
        { error: "Demo worksheets are stored in the browser." },
        { status: 409 },
      );
    }
    const session = await reopenWorksheet(
      principal,
      body.sessionId,
      body.nodeId as 1 | 2 | 3 | 4 | 5,
    );
    return Response.json({ session });
  } catch (error) {
    return apiError(error);
  }
}
