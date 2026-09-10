import type { ExperimentGroup } from "./types";

export type AllocationBlockSize = 4 | 6;

export interface EnrollmentCandidate {
  participantId: string;
  participantCode: string;
  classId: string;
}

export interface AllocationCursor {
  classId: string;
  allocatedCount: number;
  blockSize?: AllocationBlockSize;
}

export interface EnrollmentAllocation {
  participantId: string;
  participantCode: string;
  classId: string;
  group: ExperimentGroup;
  allocationBlockId: string;
  allocationPosition: number;
  allocationMethod: "permuted-block-4-6";
}

const blockPatterns: Record<AllocationBlockSize, ExperimentGroup[]> = {
  4: ["agent1", "agent2", "agent2", "agent1"],
  6: ["agent1", "agent2", "agent1", "agent2", "agent2", "agent1"],
};

export function createBalancedAllocationBlock(
  blockId: string,
  blockSize: AllocationBlockSize = 4,
): Array<{ group: ExperimentGroup; allocationBlockId: string; allocationPosition: number }> {
  return blockPatterns[blockSize].map((group, index) => ({
    group,
    allocationBlockId: blockId,
    allocationPosition: index + 1,
  }));
}

export function planEnrollmentAllocations(
  candidates: EnrollmentCandidate[],
  cursors: AllocationCursor[],
): EnrollmentAllocation[] {
  const cursorByClass = new Map(
    cursors.map((cursor) => [cursor.classId, { ...cursor }]),
  );
  return candidates.map((candidate) => {
    const cursor = cursorByClass.get(candidate.classId) ?? {
      classId: candidate.classId,
      allocatedCount: 0,
      blockSize: 4 as AllocationBlockSize,
    };
    const blockSize = cursor.blockSize ?? 4;
    const blockNumber = Math.floor(cursor.allocatedCount / blockSize) + 1;
    const position = cursor.allocatedCount % blockSize;
    const blockId = `${candidate.classId}-block-${blockNumber}`;
    const group = blockPatterns[blockSize][position];
    cursor.allocatedCount += 1;
    cursorByClass.set(candidate.classId, cursor);
    return {
      ...candidate,
      group,
      allocationBlockId: blockId,
      allocationPosition: position + 1,
      allocationMethod: "permuted-block-4-6",
    };
  });
}

export function participantCodeForSequence(
  prefix: string,
  sequence: number,
  width = 3,
): string {
  const normalizedPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "-");
  if (!normalizedPrefix) throw new Error("Participant code prefix is required.");
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Participant code sequence must be a positive integer.");
  }
  return `${normalizedPrefix}-${String(sequence).padStart(width, "0")}`;
}
