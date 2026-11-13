import type { NodeId } from "./types";

/**
 * The Page a Study Restart began again from, read from a session's
 * `restartTrigger`.
 */
export function restartedPage(trigger: unknown): NodeId | undefined {
  if (!trigger || typeof trigger !== "object") return undefined;
  const nodeId = Number((trigger as { nodeId?: unknown }).nodeId);
  return Number.isInteger(nodeId) && nodeId >= 1 && nodeId <= 5
    ? (nodeId as NodeId)
    : undefined;
}

export interface LineageSegment<Row> {
  /** `restartTrigger` as stored on this segment's Study Session. */
  restartTrigger: unknown;
  rows: Row[];
}

/**
 * Merges the rows of a chain of linked Study Sessions, oldest first, into what
 * the participant should see: a Study Restart replaces everything from the
 * restarted Page onward with the next session's rows.
 *
 * A session's `restartTrigger` is overwritten when that session is itself
 * restarted, so on every session except the last it describes the restart that
 * ended it. The Page that segment N restarted from is therefore read from
 * segment N-1, never from segment N.
 */
export function mergeLineageRows<Row extends { nodeId?: unknown }>(
  segments: LineageSegment<Row>[],
): Row[] {
  let rows: Row[] = [];
  segments.forEach((segment, index) => {
    if (index > 0) {
      const page = restartedPage(segments[index - 1].restartTrigger);
      if (page) rows = rows.filter((row) => Number(row.nodeId) < page);
    }
    rows.push(...segment.rows);
  });
  return rows;
}
