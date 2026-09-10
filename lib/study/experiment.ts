import type {
  ExperimentBatch,
  ExperimentBatchStatus,
  ExperimentGroup,
  ExperimentMode,
  StudyThresholds,
} from "./types";

export interface CreateExperimentDraftInput {
  id: string;
  code: string;
  name: string;
  mode: ExperimentMode;
  configVersion: string;
  vocabularyVersion: string;
  thresholds: StudyThresholds;
  consentVersion: string;
  participantCodePrefix: string;
  createdBy: string;
  createdAt: string;
}

export interface ExperimentTransitionContext {
  actorId: string;
  timestamp: string;
}

export function createExperimentDraft(
  input: CreateExperimentDraftInput,
): ExperimentBatch {
  return {
    id: input.id,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    mode: input.mode,
    status: "draft",
    configVersion: input.configVersion,
    vocabularyVersion: input.vocabularyVersion,
    thresholds: input.thresholds,
    consentVersion: input.consentVersion,
    allocationMethod: "permuted-block-4-6",
    participantCodePrefix: input.participantCodePrefix.trim().toUpperCase(),
    rosterSize: 0,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  };
}

export function activateExperiment(
  experiment: ExperimentBatch,
  context: ExperimentTransitionContext,
  readiness: { rosterSize: number; missingConsentCount: number },
): ExperimentBatch {
  assertStatus(experiment, "draft");
  if (readiness.rosterSize < 1) {
    throw new Error("An experiment needs at least one enrollment before activation.");
  }
  if (experiment.mode === "formal" && readiness.missingConsentCount > 0) {
    throw new Error("Formal experiments cannot activate with missing consent data.");
  }
  return {
    ...experiment,
    status: "active",
    rosterSize: readiness.rosterSize,
    activatedAt: context.timestamp,
    activatedBy: context.actorId,
  };
}

export function closeExperiment(
  experiment: ExperimentBatch,
  context: ExperimentTransitionContext,
  activeSessionCount: number,
): ExperimentBatch {
  assertStatus(experiment, "active");
  if (activeSessionCount > 0) {
    throw new Error("An experiment with active sessions cannot be closed.");
  }
  return {
    ...experiment,
    status: "closed",
    closedAt: context.timestamp,
    closedBy: context.actorId,
  };
}

export function archiveExperiment(
  experiment: ExperimentBatch,
  context: ExperimentTransitionContext,
): ExperimentBatch {
  if (experiment.status !== "closed") {
    throw new Error("Only a closed experiment can be archived.");
  }
  return {
    ...experiment,
    status: "archived",
    closedAt: experiment.closedAt ?? context.timestamp,
    closedBy: experiment.closedBy ?? context.actorId,
  };
}

export function canCreateSession(status: ExperimentBatchStatus): boolean {
  return status === "active";
}

export function createBalancedBlock(
  blockId: string,
  groups: ExperimentGroup[],
): { id: string; groups: ExperimentGroup[] } {
  if (groups.length !== 4 && groups.length !== 6) {
    throw new Error("Allocation blocks must contain 4 or 6 participants.");
  }
  const agent1 = groups.filter((group) => group === "agent1").length;
  const agent2 = groups.filter((group) => group === "agent2").length;
  if (agent1 !== agent2) {
    throw new Error("Allocation blocks must balance both experiment groups.");
  }
  return { id: blockId, groups: [...groups] };
}

function assertStatus(
  experiment: ExperimentBatch,
  expected: ExperimentBatchStatus,
): void {
  if (experiment.status !== expected) {
    throw new Error(
      `Experiment ${experiment.code} must be ${expected} before this transition.`,
    );
  }
}
