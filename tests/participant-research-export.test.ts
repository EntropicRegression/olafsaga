import { describe, expect, it } from "vitest";
import { buildParticipantResearchExport } from "@/lib/study/research-export";

describe("participant research export", () => {
  it("creates one complete record per participant without audio references", () => {
    const artifacts = buildParticipantResearchExport(
      {
        participants: [
          {
            id: "participant-1",
            code: "ANNA-021",
            classId: "Class 801",
            group: "agent2",
            consentVersion: "consent-v1",
            consentedAt: "2026-09-01T00:00:00.000Z",
          },
        ],
        sessions: [
          {
            id: "session-1",
            participantId: "participant-1",
            participantCode: "ANNA-021",
            classId: "Class 801",
            group: "agent2",
            rootSessionId: "session-1",
            restartIndex: 0,
            status: "restarted",
            startedAt: "2026-09-10T09:00:00.000Z",
          },
          {
            id: "session-2",
            participantId: "participant-1",
            participantCode: "ANNA-021",
            classId: "Class 801",
            group: "agent2",
            rootSessionId: "session-1",
            restartIndex: 1,
            status: "completed",
            startedAt: "2026-09-10T09:10:00.000Z",
          },
        ],
        attempts: [
          {
            id: "attempt-1",
            sessionId: "session-1",
            nodeId: 1,
            round: "plot",
            attemptNumber: 1,
            status: "passed",
            decision: "PASS",
            transcript: "Elsa removed her glove and ran away.",
            wordCount: 7,
            speechScores: { accuracy: 80, fluency: 70, prosody: 60 },
            emotion: { targetScore: 0.75 },
            storagePath: "audio/participant-1/session-1/attempt-1.wav",
            audioPath: "audio/participant-1/session-1/attempt-1.wav",
            createdAt: "2026-09-10T09:01:00.000Z",
          },
          {
            id: "attempt-2",
            sessionId: "session-2",
            nodeId: 1,
            round: "plot",
            attemptNumber: 1,
            status: "technical_error",
            decision: "TECHNICAL_ERROR",
            transcript: "",
            speechScores: { accuracy: null, fluency: null, prosody: null },
            createdAt: "2026-09-10T09:11:00.000Z",
          },
        ],
        restarts: [
          {
            id: "restart-1",
            participantId: "participant-1",
            rootSessionId: "session-1",
            fromSessionId: "session-1",
            toSessionId: "session-2",
            restartIndex: 1,
            trigger: {
              attemptId: "attempt-x",
              nodeId: 3,
              round: "feeling",
              attemptNumber: 3,
              reason: "forced_advance",
            },
          },
        ],
        messages: [
          {
            id: "message-1",
            sessionId: "session-1",
            role: "student",
            text: "Elsa removed her glove and ran away.",
            createdAt: "2026-09-10T09:01:00.000Z",
          },
        ],
        worksheets: [
          {
            id: "1",
            sessionId: "session-2",
            nodeId: 1,
            storySummary: "Elsa ran away.",
            emotionWord: "surprised",
            status: "confirmed",
          },
        ],
        researchNotes: [
          {
            id: "note-1",
            sessionId: "session-1",
            text: "Restart observed.",
            createdAt: "2026-09-10T09:09:00.000Z",
          },
        ],
      },
      "2026-09-10T12:00:00.000Z",
    );

    const lines = artifacts.participantRecordsJsonl.trim().split("\n");
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.participant).toMatchObject({
      id: "participant-1",
      code: "ANNA-021",
      classId: "Class 801",
      group: "agent2",
    });
    expect(record.summary).toMatchObject({
      completed: true,
      sessionCount: 2,
      restartCount: 1,
      totalAttempts: 2,
      evaluatedAttempts: 1,
      passedAttempts: 1,
      passRate: 100,
      averageAccuracy: 80,
      averageFluency: 70,
      averageProsody: 60,
      averageEmotionScore: 0.75,
    });
    expect(record.runs).toHaveLength(2);
    expect(record.runs[0].sessionId).toBe("session-1");
    expect(record.runs[0].attempts[0].attemptId).toBe("attempt-1");
    expect(record.runs[0].attempts[0].transcript).toBe(
      "Elsa removed her glove and ran away.",
    );
    expect(record.runs[0].attempts[0].storagePath).toBeUndefined();
    expect(record.runs[0].attempts[0].audioPath).toBeUndefined();
    expect(record.runs[0].messages).toHaveLength(1);
    expect(record.runs[0].researchNotes).toHaveLength(1);
    expect(record.runs[1].worksheet).toHaveLength(1);
    expect(record.restarts).toHaveLength(1);
    expect(artifacts.participantRecordsJsonl).not.toContain("audio/");
  });

  it("produces a comparison CSV and a self-describing manifest", () => {
    const artifacts = buildParticipantResearchExport(
      {
        participants: [
          { id: "p1", code: "A-001", classId: "C1", group: "agent1" },
          { id: "p2", code: "A-002", classId: "C1", group: "agent2" },
        ],
        sessions: [],
        attempts: [],
        restarts: [],
        messages: [],
        worksheets: [],
        researchNotes: [],
      },
      "2026-09-10T12:00:00.000Z",
    );

    const csvLines = artifacts.participantSummaryCsv.trim().split("\r\n");
    expect(csvLines).toHaveLength(3);
    expect(csvLines[0]).toContain("participantCode");
    expect(csvLines[0]).toContain("group");
    expect(csvLines[0]).toContain("averageAccuracy");

    const manifest = JSON.parse(artifacts.manifestJson);
    expect(manifest).toMatchObject({
      schemaVersion: "participant-research-export-v1",
      participantCount: 2,
      groupCounts: { agent1: 1, agent2: 1, unassigned: 0 },
      audioIncluded: false,
    });
    expect(manifest.files).toEqual([
      "participant-records.jsonl",
      "participant-summary.csv",
      "manifest.json",
    ]);
  });
});
