import { describe, expect, it } from "vitest";
import {
  containsChinese,
  countEnglishWords,
  isUnknownResponse,
  normalizeTranscript,
} from "@/lib/study/text";

describe("transcript helpers", () => {
  it("normalizes whitespace and curly apostrophes", () => {
    expect(normalizeTranscript("  I   don’t know  ")).toBe("I don't know");
  });

  it("counts English words but ignores fillers", () => {
    expect(countEnglishWords("Um, Elsa's magic hit Anna and her hair turned white.")).toBe(9);
  });

  it("detects Chinese and explicit unknown answers", () => {
    expect(containsChinese("我不知道這個故事")).toBe(true);
    expect(isUnknownResponse("I don't know")).toBe(true);
    expect(isUnknownResponse("Elsa ran away after her magic appeared.")).toBe(false);
  });
});
