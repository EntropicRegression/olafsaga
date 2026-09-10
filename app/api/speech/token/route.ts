import { requirePrincipal } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { TechnicalFailureError } from "@/lib/study/technical-failure";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const principal = await requirePrincipal(request);
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION ?? "eastasia";
    if (principal.demo) {
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
    if (!key) {
      throw new TechnicalFailureError(
        "SPEECH_NOT_CONFIGURED",
        "AZURE_SPEECH_KEY is missing.",
      );
    }
    let response: Response;
    try {
      response = await fetch(
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
    } catch (error) {
      throw new TechnicalFailureError(
        "SPEECH_SERVICE_UNAVAILABLE",
        error instanceof Error ? error.message : "Azure Speech token exchange failed.",
        { cause: error },
      );
    }
    if (!response.ok) {
      throw new TechnicalFailureError(
        response.status === 401 || response.status === 403
          ? "SPEECH_AUTH_FAILED"
          : "SPEECH_SERVICE_UNAVAILABLE",
        `Azure Speech token exchange returned HTTP ${response.status}.`,
      );
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
