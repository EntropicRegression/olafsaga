import type { StudySession } from "./types";

export type StaleAttemptReason = "session_not_active" | "position_changed";

export interface AttemptPosition {
  nodeId: number;
  round: string;
  attemptNumber: number;
}

/**
 * An Attempt is reserved for one Page, Round and Attempt number. It may only
 * move the Study Session while the session is still waiting at that position;
 * otherwise a recording from another tab, another device or an old retry queue
 * would advance, rewind or reopen a session it no longer belongs to.
 */
export function staleAttemptReason(
  session: Pick<StudySession, "status" | "nodeId" | "round" | "attemptNumber">,
  attempt: AttemptPosition,
): StaleAttemptReason | null {
  if (session.status !== "active") return "session_not_active";
  if (
    session.nodeId !== attempt.nodeId ||
    session.round !== attempt.round ||
    session.attemptNumber !== attempt.attemptNumber
  ) {
    return "position_changed";
  }
  return null;
}
