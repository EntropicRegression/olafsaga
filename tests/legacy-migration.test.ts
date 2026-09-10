import { describe, expect, it } from "vitest";
import { buildLegacyMigrationPlan } from "@/lib/study/legacy-migration";
import type { ExperimentBatch } from "@/lib/study/types";

const experiment: ExperimentBatch = {
  id: "legacy-unscoped",
  code: "LEGACY-UNSCOPED",
  name: "Legacy",
  mode: "test",
  status: "active",
  configVersion: "study-v1",
  vocabularyVersion: "vocab-v1",
  thresholds: {
    minimumWordCount: 3,
    accuracy: 0.6,
    fluency: 0.6,
    emotionMinimumScore: 0.4,
    emotionMaximumRank: 3,
    maximumAttempts: 3,
    maximumRecordingSeconds: 30,
  },
  consentVersion: "legacy-unknown",
  allocationMethod: "permuted-block-4-6",
  participantCodePrefix: "LEGACY",
  rosterSize: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "researcher",
};

describe("legacy migration planning", () => {
  it("preserves an existing group and links only unscoped sessions", () => {
    const plan = buildLegacyMigrationPlan(
      experiment,
      [
        { id: "p1", code: "A-001", classId: "C1", group: "agent2", consentedAt: "" },
        { id: "p2", code: "A-002", classId: "C1", group: null },
      ],
      [
        { id: "s1", participantId: "p1" },
        { id: "s2", participantId: "p2", experimentId: "other" },
      ],
      "2026-09-10T00:00:00.000Z",
    );
    expect(plan.enrollments[0].group).toBe("agent2");
    expect(plan.enrollments).toHaveLength(2);
    expect(plan.sessionLinks).toEqual([
      { sessionId: "s1", enrollmentId: "p1", participantId: "p1" },
    ]);
  });
});
