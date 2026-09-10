import { describe, expect, it } from "vitest";

const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!emulatorEnabled)("experiment batch Firebase emulator contract", () => {
  it("provisions an enrollment once, binds sessions, and closes after completion", async () => {
    const [{ adminDb }, { createExperiment }, { createExperimentEnrollments }, { activateExperimentInStore, closeExperimentInStore }, { getOrCreateSession }] = await Promise.all([
      import("@/lib/firebase/admin"),
      import("@/lib/server/experiment-repository"),
      import("@/lib/server/experiment-enrollment"),
      import("@/lib/server/experiment-repository"),
      import("@/lib/server/repository"),
    ]);
    const db = adminDb();
    const researcher = {
      uid: "emulator-researcher",
      code: "RESEARCHER",
      classId: "research",
      role: "researcher" as const,
      group: null,
      consentVersion: null,
      demo: false,
    };
    await db.collection("studyMetadata").doc("current").set({
      configVersion: "study-emulator-v1",
      vocabularyVersion: "vocabulary-emulator-v1",
    });
    const experiment = await createExperiment(researcher, {
      code: `EMU-${Date.now()}`,
      name: "Emulator contract",
      mode: "test",
      consentVersion: "consent-emulator-v1",
      participantCodePrefix: `EMU${Date.now()}`,
    });
    const idempotencyKey = `emulator-${Date.now()}`;
    const first = await createExperimentEnrollments(
      researcher,
      experiment.id,
      [{ classId: "CLASS-A", consentedAt: "2026-09-10T08:00:00.000Z" }],
      idempotencyKey,
    );
    await expect(
      createExperimentEnrollments(
        researcher,
        experiment.id,
        [{ classId: "CLASS-A", consentedAt: "2026-09-10T08:00:00.000Z" }],
        idempotencyKey,
      ),
    ).rejects.toThrow();
    const active = await activateExperimentInStore(researcher, experiment.id);
    expect(active.status).toBe("active");
    const participant = await db.collection("participants").where("code", "==", first.credentials[0].participantCode).limit(1).get();
    const participantData = participant.docs[0].data();
    const principal = {
      uid: participant.docs[0].id,
      code: String(participantData.code),
      experimentId: String(participantData.activeExperimentId),
      enrollmentId: String(participantData.activeEnrollmentId),
      classId: String(participantData.classId),
      role: "student" as const,
      group: participantData.group,
      consentVersion: String(participantData.consentVersion),
      demo: false,
    };
    const session = await getOrCreateSession(principal);
    expect(session.experimentId).toBe(experiment.id);
    expect(session.enrollmentId).toBe(principal.enrollmentId);
    await db.collection("sessions").doc(session.id).update({ status: "completed" });
    const closed = await closeExperimentInStore(researcher, experiment.id);
    expect(closed.status).toBe("closed");
  });
});
