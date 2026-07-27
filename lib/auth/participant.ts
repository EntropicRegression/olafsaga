export function participantEmail(code: string): string {
  const slug = code.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `${slug}@participants.olaf.study`;
}
