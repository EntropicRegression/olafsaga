import { describe, expect, it } from "vitest";
import { allStaticTemplates } from "@/lib/study/templates";
import { countEnglishWords, stripFormatting } from "@/lib/study/text";

describe("approved response library", () => {
  it("keeps ordinary messages between 12 and 15 English words", () => {
    const invalid = allStaticTemplates()
      .filter((template) => template.kind === "standard")
      .map((template) => ({
        id: template.id,
        count: countEnglishWords(stripFormatting(template.text)),
      }))
      .filter(({ count }) => count < 12 || count > 15);

    expect(invalid).toEqual([]);
  });

  it("keeps scaffolds between 4 and 5 English words", () => {
    const invalid = allStaticTemplates()
      .filter((template) => template.kind === "scaffold")
      .map((template) => ({
        id: template.id,
        count: countEnglishWords(template.text),
      }))
      .filter(({ count }) => count < 4 || count > 5);

    expect(invalid).toEqual([]);
  });

  it("has stable unique template identifiers", () => {
    const ids = allStaticTemplates().map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
