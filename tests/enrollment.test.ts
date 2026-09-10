import { describe, expect, it } from "vitest";
import {
  createBalancedAllocationBlock,
  participantCodeForSequence,
  planEnrollmentAllocations,
} from "@/lib/study/enrollment";

describe("enrollment allocation", () => {
  it("creates equal groups for four- and six-person blocks", () => {
    for (const size of [4, 6] as const) {
      const block = createBalancedAllocationBlock("class-a-block-1", size);
      expect(block).toHaveLength(size);
      expect(block.filter((item) => item.group === "agent1")).toHaveLength(size / 2);
      expect(block.filter((item) => item.group === "agent2")).toHaveLength(size / 2);
    }
  });

  it("continues the class cursor across block boundaries", () => {
    const allocations = planEnrollmentAllocations(
      [1, 2, 3, 4, 5].map((id) => ({
        participantId: `p-${id}`,
        participantCode: `TEST-${id}`,
        classId: "class-a",
      })),
      [{ classId: "class-a", allocatedCount: 3, blockSize: 4 }],
    );
    expect(allocations.map((item) => item.group)).toEqual([
      "agent1",
      "agent1",
      "agent2",
      "agent2",
      "agent1",
    ]);
    expect(allocations[0].allocationPosition).toBe(4);
    expect(allocations[1].allocationBlockId).toBe("class-a-block-2");
  });

  it("generates stable batch-scoped participant codes", () => {
    expect(participantCodeForSequence(" spring ", 7)).toBe("SPRING-007");
    expect(() => participantCodeForSequence("", 1)).toThrow();
  });
});
