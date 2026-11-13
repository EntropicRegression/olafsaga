import { describe, expect, it } from "vitest";
import { mergeLineageRows, restartedPage } from "@/lib/study/lineage";
import { staleAttemptReason } from "@/lib/study/attempt-position";

const row = (session: string, nodeId: number) => ({ session, nodeId });
const trigger = (nodeId: number) => ({ nodeId, reason: "forced_advance" });

describe("mergeLineageRows", () => {
  it("returns a single session unchanged", () => {
    const rows = [row("a", 1), row("a", 2)];
    expect(mergeLineageRows([{ restartTrigger: undefined, rows }])).toEqual(rows);
  });

  it("replaces the restarted page with the next session's rows", () => {
    expect(
      mergeLineageRows([
        { restartTrigger: trigger(2), rows: [row("a", 1), row("a", 2)] },
        { restartTrigger: trigger(2), rows: [row("b", 2)] },
      ]),
    ).toEqual([row("a", 1), row("b", 2)]);
  });

  it("reads each restart from the session it ended, not the one it began", () => {
    // Session b was created by a Page 1 restart, then ended by a Page 2
    // restart, which overwrote its trigger.
    expect(
      mergeLineageRows([
        { restartTrigger: trigger(1), rows: [row("a", 1), row("a", 1)] },
        { restartTrigger: trigger(2), rows: [row("b", 1), row("b", 2)] },
        { restartTrigger: trigger(2), rows: [row("c", 2)] },
      ]),
    ).toEqual([row("b", 1), row("c", 2)]);
  });

  it("ignores a malformed trigger", () => {
    expect(restartedPage({ nodeId: 9 })).toBeUndefined();
    expect(restartedPage("2")).toBeUndefined();
  });
});

describe("staleAttemptReason", () => {
  const session = {
    status: "active" as const,
    nodeId: 2 as const,
    round: "feeling" as const,
    attemptNumber: 2,
  };
  const attempt = { nodeId: 2, round: "feeling", attemptNumber: 2 };

  it("accepts an attempt at the session's current position", () => {
    expect(staleAttemptReason(session, attempt)).toBeNull();
  });

  it.each([
    { nodeId: 1 },
    { round: "plot" },
    { attemptNumber: 1 },
  ])("rejects an attempt reserved for another position: %o", (change) => {
    expect(staleAttemptReason(session, { ...attempt, ...change })).toBe(
      "position_changed",
    );
  });

  it.each(["awaiting_confirmation", "completed", "restarted"] as const)(
    "rejects any attempt once the session is %s",
    (status) => {
      expect(staleAttemptReason({ ...session, status }, attempt)).toBe(
        "session_not_active",
      );
    },
  );
});
