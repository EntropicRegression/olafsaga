import { describe, expect, it } from "vitest";
import {
  aggregateSegments,
  containsMonotone,
} from "@/lib/audio/azure-recognizer";

describe("Azure continuous assessment aggregation", () => {
  it("weights segment scores by recognized duration", () => {
    const result = aggregateSegments([
      {
        accuracy: 60,
        fluency: 70,
        prosody: 80,
        duration: 100,
        raw: { NBest: [{ Words: [] }] },
      },
      {
        accuracy: 90,
        fluency: 80,
        prosody: 70,
        duration: 300,
        raw: { NBest: [{ Words: [] }] },
      },
    ]);

    expect(result.accuracy).toBe(82.5);
    expect(result.fluency).toBe(77.5);
    expect(result.prosody).toBe(72.5);
    expect(result.raw).toHaveLength(2);
  });

  it("matches an actual Monotone value without matching unrelated keys", () => {
    expect(
      containsMonotone({
        Feedback: {
          Intonation: { ErrorTypes: ["Monotone"] },
        },
      }),
    ).toBe(true);
    expect(
      containsMonotone({
        Feedback: {
          Intonation: { MonotoneSyllablePitchDeltaConfidence: 0.2 },
        },
      }),
    ).toBe(false);
  });
});
