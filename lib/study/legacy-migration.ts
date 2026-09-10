import type { Enrollment, ExperimentBatch, ExperimentGroup } from "./types";
import { planEnrollmentAllocations } from "./enrollment";

export interface LegacyParticipantRecord {
  id: string;
  code: string;
  classId: string;
  group?: ExperimentGroup | null;
  consentVersion?: string | null;
  consentedAt?: string | null;
  createdAt?: string;
}

export interface LegacySessionRecord {
  id: string;
  participantId: string;
  experimentId?: string;
  enrollmentId?: string;
}

export interface LegacyMigrationPlan {
  enrollments: Enrollment[];
  participantLinks: Array<{ participantId: string; enrollmentId: string; group: ExperimentGroup }>;
  sessionLinks: Array<{ sessionId: string; enrollmentId: string; participantId: string }>;
}

export function buildLegacyMigrationPlan(
  experiment: ExperimentBatch,
  participants: LegacyParticipantRecord[],
  sessions: LegacySessionRecord[],
  timestamp: string,
): LegacyMigrationPlan {
  const candidates = participants.map((participant) => ({
    participantId: participant.id,
    participantCode: participant.code,
    classId: participant.classId || "LEGACY-UNKNOWN",
  }));
  const allocations = planEnrollmentAllocations(candidates, []);
  const enrollments = participants.map((participant, index) => {
    const allocation = allocations[index];
    const enrollmentId = participant.id;
    return {
      id: enrollmentId,
      experimentId: experiment.id,
      participantId: participant.id,
      participantCode: participant.code,
      classId: participant.classId || "LEGACY-UNKNOWN",
      group: participant.group ?? allocation.group,
      status: "issued" as const,
      allocationBlockId: allocation.allocationBlockId,
      allocationPosition: allocation.allocationPosition,
      allocationMethod: "permuted-block-4-6" as const,
      consentVersion: participant.consentVersion || experiment.consentVersion,
      consentedAt: participant.consentedAt || "",
      credentialsIssuedAt: participant.createdAt || timestamp,
    };
  });
  const enrollmentByParticipant = new Map(
    enrollments.map((enrollment) => [enrollment.participantId, enrollment]),
  );
  return {
    enrollments,
    participantLinks: enrollments.map((enrollment) => ({
      participantId: enrollment.participantId,
      enrollmentId: enrollment.id,
      group: enrollment.group,
    })),
    sessionLinks: sessions
      .filter((session) => !session.experimentId && !session.enrollmentId)
      .map((session) => ({
        sessionId: session.id,
        enrollmentId: enrollmentByParticipant.get(session.participantId)?.id ?? session.participantId,
        participantId: session.participantId,
      })),
  };
}
