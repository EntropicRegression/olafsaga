import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords } from "@/lib/study/csv";

describe("CSV parser", () => {
  it("handles BOM, CRLF, quoted commas, and escaped quotes", () => {
    expect(parseCsv("\uFEFFcode,class\r\nA-001,\"Class, A\"\r\nA-002,\"Say \"\"hello\"\"\""))
      .toEqual([
        ["code", "class"],
        ["A-001", "Class, A"],
        ["A-002", "Say \"hello\""],
      ]);
  });

  it("maps roster rows to named fields", () => {
    expect(parseCsvRecords("participantCode,classId\n,CLASS-A")).toEqual([
      { participantCode: "", classId: "CLASS-A" },
    ]);
  });

  it("rejects unterminated quotes and duplicate headers", () => {
    expect(() => parseCsv('code,class\n"A-001,CLASS-A')).toThrow();
    expect(() => parseCsvRecords("code,code\nA,A")).toThrow();
  });
});
