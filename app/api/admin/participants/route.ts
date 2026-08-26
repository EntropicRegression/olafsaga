import { z } from "zod";
import { createParticipant } from "@/lib/server/admin";
import { requireResearcher } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";

const requestSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, "Code may contain letters, numbers, and hyphens."),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Za-z]/, "Password must include a letter.")
    .regex(/[0-9]/, "Password must include a number."),
  classId: z.string().trim().min(1).max(80),
  consentVersion: z.string().trim().min(1).max(80),
  consentedAt: z.string().datetime(),
});

export async function POST(request: Request) {
  try {
    const principal = await requireResearcher(request);
    if (principal.demo) {
      return Response.json(
        { error: "Demo participants are not written to Firebase." },
        { status: 409 },
      );
    }
    const body = requestSchema.parse(await request.json());
    return Response.json(
      await createParticipant(body, principal.uid),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
