import { requirePrincipal } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import {
  getOrCreateSession,
  getSessionMessages,
  getWorksheetEntries,
} from "@/lib/server/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const principal = await requirePrincipal(request);
    if (principal.demo) {
      return Response.json({
        mode: "demo",
        message: "Demo sessions are stored in this browser.",
      });
    }
    const session = await getOrCreateSession(principal);
    const [messages, worksheet] = await Promise.all([
      getSessionMessages(principal, session.id),
      getWorksheetEntries(principal, session.id),
    ]);
    return Response.json({ mode: "firebase", session, messages, worksheet });
  } catch (error) {
    return apiError(error);
  }
}
