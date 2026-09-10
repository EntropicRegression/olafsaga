import type {
  AttemptInput,
  StudyRestart,
  StudySession,
} from "./types";

export interface StudyRestartPlan {
  previousSession: StudySession;
  nextSession: StudySession;
  restart: StudyRestart;
}

export function createStudyRestart(
  currentSession: StudySession,
  attempt: AttemptInput,
  ids: { sessionId: string; restartId: string },
  timestamp: string,
): StudyRestartPlan {
  const rootSessionId = currentSession.rootSessionId ?? currentSession.id;
  const restartIndex = (currentSession.restartIndex ?? 0) + 1;
  const trigger = {
    attemptId: attempt.attemptId,
    nodeId: attempt.nodeId,
    round: attempt.round,
    attemptNumber: attempt.attemptNumber,
    reason: "forced_advance" as const,
  };
  const restart: StudyRestart = {
    id: ids.restartId,
    participantId: currentSession.participantId,
    participantCode: currentSession.participantCode,
    ...(currentSession.experimentId ? { experimentId: currentSession.experimentId } : {}),
    ...(currentSession.enrollmentId ? { enrollmentId: currentSession.enrollmentId } : {}),
    classId: currentSession.classId,
    group: currentSession.group,
    rootSessionId,
    fromSessionId: currentSession.id,
    toSessionId: ids.sessionId,
    restartIndex,
    trigger,
    createdAt: timestamp,
  };

  return {
    previousSession: {
      ...currentSession,
      status: "restarted",
      restartedAt: timestamp,
      restartedAsSessionId: ids.sessionId,
      restartTrigger: trigger,
      updatedAt: timestamp,
    },
    nextSession: {
      id: ids.sessionId,
      participantId: currentSession.participantId,
      participantCode: currentSession.participantCode,
      ...(currentSession.experimentId ? { experimentId: currentSession.experimentId } : {}),
      ...(currentSession.enrollmentId ? { enrollmentId: currentSession.enrollmentId } : {}),
      group: currentSession.group,
      classId: currentSession.classId,
      nodeId: 1,
      round: "plot",
      attemptNumber: 1,
      status: "active",
      rootSessionId,
      restartIndex,
      restartedFromSessionId: currentSession.id,
      restartTrigger: trigger,
      configVersion: currentSession.configVersion,
      vocabularyVersion: currentSession.vocabularyVersion,
      thresholds: currentSession.thresholds,
      startedAt: timestamp,
      updatedAt: timestamp,
    },
    restart,
  };
}
