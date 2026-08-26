import { describe, expect, it } from "vitest";
import {
  evaluateAttempt,
  makeDemoEmotionEvaluation,
} from "@/lib/study/evaluator";
import type {
  AttemptInput,
  NodeId,
  RoundType,
  StudyThresholds,
} from "@/lib/study/types";
import { STUDY_THRESHOLDS, resolveStudyThresholds } from "@/lib/study/config";

function input(
  transcript: string,
  overrides: Partial<AttemptInput> = {},
): AttemptInput {
  return {
    attemptId: "attempt-1",
    sessionId: "session-1",
    participantId: "participant-1",
    group: "agent1",
    nodeId: 1,
    round: "plot",
    attemptNumber: 1,
    transcript,
    durationMs: 5000,
    speechScores: {
      accuracy: 80,
      fluency: 80,
      prosody: 75,
      monotone: false,
    },
    ...overrides,
  };
}

const validAnswers: Record<
  NodeId,
  Record<RoundType, string>
> = {
  1: {
    plot: "Elsa removed her glove, lost control of her magic, and ran away.",
    feeling: "I felt very surprised when Elsa's powerful magic suddenly filled the room.",
  },
  2: {
    plot: "Elsa's magic hit Anna, and then Anna's hair slowly turned white.",
    feeling: "I felt very scared when the magic struck me inside the palace.",
  },
  3: {
    plot: "The trolls explained that true love could thaw Anna's frozen heart.",
    feeling: "I felt deeply worried because finding true love seemed very difficult.",
  },
  4: {
    plot: "Hans did not love or kiss Anna, and he left her alone.",
    feeling: "I felt extremely sad when Hans left me alone in the cold.",
  },
  5: {
    plot: "Anna protected Elsa, and their true love melted all the frozen ice.",
    feeling: "I felt really happy when love brought our warm summer back again.",
  },
};

describe("study decision engine", () => {
  it.each(
    ([1, 2, 3, 4, 5] as NodeId[]).flatMap((nodeId) =>
      (["plot", "feeling"] as RoundType[]).map((round) => [
        nodeId,
        round,
        validAnswers[nodeId][round],
      ] as const),
    ),
  )("passes a valid agent1 response at node %s %s", (nodeId, round, transcript) => {
    const result = evaluateAttempt(input(transcript, { nodeId, round }));
    expect(result.decision).toBe("PASS");
    expect(result.status).toBe("passed");
    expect(result.emotion).toBeNull();
  });

  it("applies the required failure precedence", () => {
    expect(evaluateAttempt(input("我不知道")).decision).toBe(
      "CHINESE_OR_UNKNOWN",
    );
    expect(evaluateAttempt(input("Elsa ran away")).decision).toBe("TOO_SHORT");
    expect(
      evaluateAttempt(
        input("I really like eating pizza with my best friends after school."),
      ).decision,
    ).toBe("OFF_TOPIC");
    expect(
      evaluateAttempt(
        input(validAnswers[1].plot, {
          speechScores: {
            accuracy: 55,
            fluency: 90,
            prosody: 80,
            monotone: false,
          },
        }),
      ).decision,
    ).toBe("LOW_ACCURACY");
    expect(
      evaluateAttempt(
        input(validAnswers[1].plot, {
          speechScores: {
            accuracy: 90,
            fluency: 55,
            prosody: 80,
            monotone: false,
          },
        }),
      ).decision,
    ).toBe("LOW_FLUENCY");
  });

  it("requires emotion only for agent2", () => {
    const response = validAnswers[1].feeling;
    const agent1 = evaluateAttempt(
      input(response, { group: "agent1", round: "feeling" }),
    );
    const agent2Fail = evaluateAttempt(
      input(response, {
        group: "agent2",
        round: "feeling",
        speechScores: {
          accuracy: 90,
          fluency: 90,
          prosody: 45,
          monotone: true,
        },
      }),
      { emotion: makeDemoEmotionEvaluation(1, false) },
    );
    const agent2Pass = evaluateAttempt(
      input(response, { group: "agent2", round: "feeling" }),
      { emotion: makeDemoEmotionEvaluation(1, true) },
    );

    expect(agent1.decision).toBe("PASS");
    expect(agent2Fail.decision).toBe("LOW_EMOTION");
    expect(agent2Pass.decision).toBe("PASS");
  });

  it("forces progress on the third valid failure without calling it a pass", () => {
    const result = evaluateAttempt(
      input("Elsa ran away", { attemptNumber: 3 }),
    );
    expect(result.status).toBe("forced_advance");
    expect(result.forcedAdvance).toBe(true);
    expect(result.decision).toBe("TOO_SHORT");
    expect(result.nextRound).toBe("feeling");
  });

  it("does not count or advance technical errors", () => {
    const result = evaluateAttempt(
      input("", {
        attemptNumber: 3,
        technicalError: "Speech provider timed out.",
      }),
    );
    expect(result.status).toBe("technical_error");
    expect(result.forcedAdvance).toBe(false);
    expect(result.nextNodeId).toBe(1);
    expect(result.nextRound).toBe("plot");
    expect(Object.hasOwn(result, "toneHint")).toBe(false);
  });

  it("uses the threshold snapshot locked to the study session", () => {
    const stricter: StudyThresholds = {
      ...STUDY_THRESHOLDS,
      minimumWordCount: 20,
      maximumAttempts: 2,
    };
    const result = evaluateAttempt(
      input(validAnswers[1].plot, { attemptNumber: 2 }),
      {},
      stricter,
    );
    expect(result.decision).toBe("TOO_SHORT");
    expect(result.status).toBe("forced_advance");
  });

  it("falls back safely when an older session has no threshold snapshot", () => {
    expect(resolveStudyThresholds(undefined)).toEqual(STUDY_THRESHOLDS);
    expect(
      resolveStudyThresholds({
        ...STUDY_THRESHOLDS,
        accuracy: 72,
      }).accuracy,
    ).toBe(72);
  });
});
