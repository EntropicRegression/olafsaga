import { describe, expect, it } from "vitest";
import { STUDY_THRESHOLDS } from "@/lib/study/config";
import {
  activateExperiment,
  archiveExperiment,
  canCreateSession,
  closeExperiment,
  createBalancedBlock,
  createExperimentDraft,
} from "@/lib/study/experiment";

function draft() {
  return createExperimentDraft({
    id: "experiment-1",
    code: "pilot-2026-01",
    name: "Pilot January",
    mode: "formal",
    configVersion: "config-1",
    vocabularyVersion: "vocabulary-1",
    thresholds: STUDY_THRESHOLDS,
    consentVersion: "consent-1",
    participantCodePrefix: "PILOT01",
    createdBy: "researcher-1",
    createdAt: "2026-09-10T09:00:00.000Z",
  });
}

describe("experiment batch lifecycle", () => {
  it("creates a draft with immutable protocol snapshots", () => {
    expect(draft()).toMatchObject({
      id: "experiment-1",
      code: "PILOT-2026-01",
      status: "draft",
      mode: "formal",
      configVersion: "config-1",
      vocabularyVersion: "vocabulary-1",
      rosterSize: 0,
    });
  });

  it("activates only after roster and formal consent readiness", () => {
    expect(() =>
      activateExperiment(
        draft(),
        { actorId: "researcher-1", timestamp: "2026-09-10T09:01:00.000Z" },
        { rosterSize: 2, missingConsentCount: 1 },
      ),
    ).toThrow("missing consent");

    const active = activateExperiment(
      draft(),
      { actorId: "researcher-1", timestamp: "2026-09-10T09:01:00.000Z" },
      { rosterSize: 2, missingConsentCount: 0 },
    );
    expect(active).toMatchObject({
      status: "active",
      rosterSize: 2,
      activatedBy: "researcher-1",
    });
    expect(canCreateSession(active.status)).toBe(true);
  });

  it("blocks closing while sessions are active, then archives closed data", () => {
    const active = activateExperiment(
      draft(),
      { actorId: "researcher-1", timestamp: "2026-09-10T09:01:00.000Z" },
      { rosterSize: 2, missingConsentCount: 0 },
    );
    expect(() =>
      closeExperiment(
        active,
        { actorId: "researcher-1", timestamp: "2026-09-10T10:00:00.000Z" },
        1,
      ),
    ).toThrow("active sessions");

    const closed = closeExperiment(
      active,
      { actorId: "researcher-1", timestamp: "2026-09-10T10:00:00.000Z" },
      0,
    );
    expect(canCreateSession(closed.status)).toBe(false);
    expect(
      archiveExperiment(closed, {
        actorId: "researcher-1",
        timestamp: "2026-09-11T10:00:00.000Z",
      }).status,
    ).toBe("archived");
  });

  it("rejects unbalanced allocation blocks", () => {
    expect(
      createBalancedBlock("block-1", ["agent1", "agent1", "agent2", "agent2"]),
    ).toEqual({
      id: "block-1",
      groups: ["agent1", "agent1", "agent2", "agent2"],
    });
    expect(() =>
      createBalancedBlock("block-2", ["agent1", "agent1", "agent1", "agent2"]),
    ).toThrow("balance");
  });
});
