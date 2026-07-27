import { requirePrincipal } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const principal = await requirePrincipal(request);
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION ?? "eastasia";
    if (principal.demo || !key) {
      return Response.json(
        {
          configured: false,
          demo: true,
          region,
          message: "Azure Speech is not configured; local demo mode is active.",
        },
        { status: 200 },
      );
    }
    const response = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "content-type": "application/x-www-form-urlencoded",
        },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) {
      throw new Error(`Azure Speech token exchange returned ${response.status}.`);
    }
    return Response.json({
      configured: true,
      token: await response.text(),
      region,
      expiresInSeconds: 540,
    });
  } catch (error) {
    return apiError(error);
  }
}
