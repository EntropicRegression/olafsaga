const ENGLISH_WORD_PATTERN = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
const FILLER_WORDS = new Set(["um", "uh", "erm", "hmm", "mm"]);

export function normalizeTranscript(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function getEnglishWords(value: string): string[] {
  const matches = normalizeTranscript(value).match(ENGLISH_WORD_PATTERN) ?? [];
  return matches.filter((word) => !FILLER_WORDS.has(word.toLowerCase()));
}

export function countEnglishWords(value: string): number {
  return getEnglishWords(value).length;
}

export function containsChinese(value: string): boolean {
  const normalized = normalizeTranscript(value);
  const meaningful = normalized.replace(/[\s\d\p{P}\p{S}]/gu, "");
  if (!meaningful) return false;
  const han = meaningful.match(/\p{Script=Han}/gu)?.length ?? 0;
  return han / meaningful.length >= 0.2;
}

export function isUnknownResponse(value: string): boolean {
  const normalized = normalizeTranscript(value).toLowerCase();
  return (
    normalized.length === 0 ||
    /\b(i\s+do\s*n't\s+know|i\s+dont\s+know|not\s+sure|no\s+idea)\b/.test(
      normalized,
    )
  );
}

export function stripFormatting(value: string): string {
  return value.replace(/\*\*/g, "").replace(/[_`#]/g, "");
}
