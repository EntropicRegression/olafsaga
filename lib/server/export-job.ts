import "server-only";

import { getGoogleAuth } from "./google-auth";

export function isWavExportJobConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLOUD_PROJECT &&
      process.env.CLOUD_RUN_EXPORT_REGION &&
      process.env.CLOUD_RUN_EXPORT_JOB_NAME &&
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  );
}

export async function enqueueWavExport(
  exportId: string,
  prefix: string,
): Promise<{ operationName: string }> {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const region = process.env.CLOUD_RUN_EXPORT_REGION;
  const jobName = process.env.CLOUD_RUN_EXPORT_JOB_NAME;
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!project || !region || !jobName || !bucket) {
    throw new Error("The Cloud Run WAV export job is not configured.");
  }

  const auth = getGoogleAuth([
    "https://www.googleapis.com/auth/cloud-platform",
  ]);
  const client = await auth.getClient();
  const url = `https://run.googleapis.com/v2/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(region)}/jobs/${encodeURIComponent(jobName)}:run`;
  const response = await client.request<{
    name?: string;
  }>({
    url,
    method: "POST",
    data: {
      overrides: {
        containerOverrides: [
          {
            env: [
              { name: "EXPORT_ID", value: exportId },
              { name: "EXPORT_PREFIX", value: prefix },
              { name: "STORAGE_BUCKET", value: bucket },
            ],
          },
        ],
        taskCount: 1,
        timeout: "3600s",
      },
    },
  });

  return { operationName: response.data.name ?? "" };
}
