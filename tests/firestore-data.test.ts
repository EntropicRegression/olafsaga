import { describe, expect, it } from "vitest";
import { withoutUndefinedProperties } from "@/lib/server/firestore-data";

describe("Firestore data sanitization", () => {
  it("omits optional undefined fields before persistence", () => {
    expect(
      withoutUndefinedProperties({
        transcript: "Everything is icy.",
        technicalError: undefined,
        technicalErrorCode: undefined,
        emotion: null,
      }),
    ).toEqual({
      transcript: "Everything is icy.",
      emotion: null,
    });
  });
});
