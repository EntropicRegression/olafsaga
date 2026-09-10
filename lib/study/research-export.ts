export interface ResearchDocument extends Record<string, unknown> {
  id: string;
}

export interface SessionResearchDocument extends ResearchDocument {
  sessionId: string;
}

export interface ParticipantResearchExportSource {
  participants: ResearchDocument[];
  sessions: ResearchDocument[];
  attempts: SessionResearchDocument[];
  restarts: ResearchDocument[];
  messages: SessionResearchDocument[];
  worksheets: SessionResearchDocument[];
  researchNotes: SessionResearchDocument[];
}

export interface ParticipantResearchExportArtifacts {
  participantRecordsJsonl: string;
  participantSummaryCsv: string;
  manifestJson: string;
  participantCount: number;
  sessionCount: number;
  attemptCount: number;
  restartCount: number;
}

export interface ParticipantResearchExportMetadata {
  experimentId?: string;
  experimentCode?: string;
}

const SCHEMA_VERSION = "participant-research-export-v1";

function asString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  if (!numbers.length) return null;
  return Number(
    (numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(4),
  );
}

function csvEscape(value: unknown): string {
  const string = value === null || value === undefined ? "" : String(value);
  return `"${string.replace(/"/g, '""')}"`;
}

function byTimeThenId(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): number {
  return (
    asString(left.createdAt ?? left.startedAt).localeCompare(
      asString(right.createdAt ?? right.startedAt),
    ) || asString(left.id).localeCompare(asString(right.id))
  );
}

function withoutAudioReferences(
  document: ResearchDocument,
): ResearchDocument {
  const record = { ...document };
  delete record.storagePath;
  delete record.audioPath;
  return record;
}

function publicParticipant(
  participant: ResearchDocument,
  fallbackSession?: ResearchDocument,
): ResearchDocument {
  const value = (field: string) => participant[field] ?? fallbackSession?.[field];
  return {
    id: participant.id,
    code: value("code") ?? value("participantCode") ?? "",
    experimentId: value("experimentId") ?? null,
    enrollmentId: value("enrollmentId") ?? null,
    classId: value("classId") ?? "",
    group: value("group") ?? null,
    consentVersion: value("consentVersion") ?? null,
    consentedAt: value("consentedAt") ?? null,
    createdAt: value("createdAt") ?? null,
    groupAssignedAt: value("groupAssignedAt") ?? null,
    groupAssignmentMethod: value("groupAssignmentMethod") ?? null,
  };
}

function sessionDocuments(
  documents: SessionResearchDocument[],
  sessionId: string,
): ResearchDocument[] {
  return documents
    .filter((document) => document.sessionId === sessionId)
    .map((document) => {
      const record: Record<string, unknown> = { ...document };
      delete record.sessionId;
      return record as ResearchDocument;
    })
    .sort(byTimeThenId);
}

function renameDocumentId(
  document: ResearchDocument,
  key: string,
): Record<string, unknown> {
  const record: Record<string, unknown> = { ...document };
  delete record.id;
  record[key] = document.id;
  return record;
}

function buildSummary(
  participant: ResearchDocument,
  sessions: ResearchDocument[],
  attempts: ResearchDocument[],
  restarts: ResearchDocument[],
) {
  const evaluated = attempts.filter((attempt) =>
    ["passed", "failed", "forced_advance"].includes(asString(attempt.status)),
  );
  const passed = evaluated.filter((attempt) => attempt.status === "passed");
  const speechScores = attempts.map(
    (attempt) => (attempt.speechScores ?? {}) as Record<string, unknown>,
  );
  const emotionScores = attempts.map((attempt) =>
    asNumber(
      (attempt.emotion as Record<string, unknown> | null | undefined)
        ?.targetScore,
    ),
  );

  return {
    experimentId: asString(participant.experimentId),
    enrollmentId: asString(participant.enrollmentId),
    participantCode: asString(participant.code),
    classId: asString(participant.classId),
    group: asString(participant.group) || "unassigned",
    completed: sessions.some((session) => session.status === "completed"),
    sessionCount: sessions.length,
    restartCount: restarts.length,
    totalAttempts: attempts.length,
    evaluatedAttempts: evaluated.length,
    passedAttempts: passed.length,
    failedAttempts: evaluated.filter((attempt) => attempt.status === "failed")
      .length,
    forcedAdvanceAttempts: evaluated.filter(
      (attempt) => attempt.status === "forced_advance",
    ).length,
    technicalErrorAttempts: attempts.filter(
      (attempt) => attempt.status === "technical_error",
    ).length,
    passRate: evaluated.length
      ? Number(((passed.length / evaluated.length) * 100).toFixed(2))
      : null,
    averageAccuracy: average(
      speechScores.map((scores) => asNumber(scores.accuracy)),
    ),
    averageFluency: average(
      speechScores.map((scores) => asNumber(scores.fluency)),
    ),
    averageProsody: average(
      speechScores.map((scores) => asNumber(scores.prosody)),
    ),
    averageEmotionScore: average(emotionScores),
  };
}

export function buildParticipantResearchExport(
  source: ParticipantResearchExportSource,
  exportedAt: string,
  metadata: ParticipantResearchExportMetadata = {},
): ParticipantResearchExportArtifacts {
  const sessionsByParticipant = new Map<string, ResearchDocument[]>();
  for (const session of source.sessions) {
    const participantId = asString(session.participantId);
    if (!participantId) continue;
    const sessions = sessionsByParticipant.get(participantId) ?? [];
    sessions.push(session);
    sessionsByParticipant.set(participantId, sessions);
  }

  const participantsById = new Map(
    source.participants.map((participant) => [participant.id, participant]),
  );
  for (const [participantId, sessions] of sessionsByParticipant) {
    if (participantsById.has(participantId)) continue;
    participantsById.set(participantId, {
      id: participantId,
      code: sessions[0]?.participantCode ?? participantId,
      classId: sessions[0]?.classId ?? "",
      group: sessions[0]?.group ?? null,
    });
  }

  const records = [...participantsById.values()]
    .map((participant) => {
      const participantSessions = [
        ...(sessionsByParticipant.get(participant.id) ?? []),
      ].sort((left, right) => {
        const restartDifference =
          Number(left.restartIndex ?? 0) - Number(right.restartIndex ?? 0);
        return restartDifference || byTimeThenId(left, right);
      });
      const sessionIds = new Set(
        participantSessions.map((session) => session.id),
      );
      const participantAttempts = source.attempts
        .filter((attempt) => sessionIds.has(attempt.sessionId))
        .map(withoutAudioReferences)
        .sort(byTimeThenId);
      const participantRestarts = source.restarts
        .filter(
          (restart) =>
            restart.participantId === participant.id ||
            sessionIds.has(asString(restart.fromSessionId)) ||
            sessionIds.has(asString(restart.toSessionId)),
        )
        .sort(byTimeThenId);
      const participantData = publicParticipant(
        participant,
        participantSessions[0],
      );
      const summary = buildSummary(
        participantData,
        participantSessions,
        participantAttempts,
        participantRestarts,
      );

      return {
        participant: participantData,
        summary,
        runs: participantSessions.map((session) => {
          const sessionData = renameDocumentId(session, "sessionId");
          return {
            ...sessionData,
            attempts: sessionDocuments(source.attempts, session.id)
              .map(withoutAudioReferences)
              .map((attempt) => renameDocumentId(attempt, "attemptId")),
            messages: sessionDocuments(source.messages, session.id).map(
              (message) => renameDocumentId(message, "messageId"),
            ),
            worksheet: sessionDocuments(source.worksheets, session.id).map(
              (entry) => renameDocumentId(entry, "entryId"),
            ),
            researchNotes: sessionDocuments(
              source.researchNotes,
              session.id,
            ).map((note) => renameDocumentId(note, "noteId")),
          };
        }),
        restarts: participantRestarts,
      };
    })
    .sort(
      (left, right) =>
        asString(left.participant.code).localeCompare(
          asString(right.participant.code),
        ) ||
        asString(left.participant.id).localeCompare(
          asString(right.participant.id),
        ),
    );

  const summaryHeaders = [
    "experimentId",
    "enrollmentId",
    "participantCode",
    "classId",
    "group",
    "completed",
    "sessionCount",
    "restartCount",
    "totalAttempts",
    "evaluatedAttempts",
    "passedAttempts",
    "failedAttempts",
    "forcedAdvanceAttempts",
    "technicalErrorAttempts",
    "passRate",
    "averageAccuracy",
    "averageFluency",
    "averageProsody",
    "averageEmotionScore",
  ];
  const participantSummaryCsv = [
    summaryHeaders.map(csvEscape).join(","),
    ...records.map((record) =>
      summaryHeaders
        .map((header) =>
          csvEscape(
            (record.summary as unknown as Record<string, unknown>)[header],
          ),
        )
        .join(","),
    ),
  ].join("\r\n");
  const groupCounts = records.reduce(
    (counts, record) => {
      const group = asString(record.participant.group);
      if (group === "agent1" || group === "agent2") counts[group] += 1;
      else counts.unassigned += 1;
      return counts;
    },
    { agent1: 0, agent2: 0, unassigned: 0 },
  );
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    ...(metadata.experimentId ? { experimentId: metadata.experimentId } : {}),
    ...(metadata.experimentCode ? { experimentCode: metadata.experimentCode } : {}),
    format: "one JSON object per participant per line",
    participantCount: records.length,
    sessionCount: source.sessions.length,
    attemptCount: source.attempts.length,
    restartCount: source.restarts.length,
    groupCounts,
    audioIncluded: false,
    files: [
      "participant-records.jsonl",
      "participant-summary.csv",
      "manifest.json",
    ],
    notes: [
      "Attempts include transcripts but omit storagePath and audioPath.",
      "Technical errors are excluded from the pass-rate denominator.",
      "Restarted runs remain linked through rootSessionId and restartIndex.",
    ],
  };

  return {
    participantRecordsJsonl: records
      .map((record) => JSON.stringify(record))
      .join("\n"),
    participantSummaryCsv,
    manifestJson: JSON.stringify(manifest, null, 2),
    participantCount: records.length,
    sessionCount: source.sessions.length,
    attemptCount: source.attempts.length,
    restartCount: source.restarts.length,
  };
}
