"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Download,
  FlaskConical,
  LoaderCircle,
  LockKeyhole,
  Play,
  Plus,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import type { ExperimentBatch, Enrollment } from "@/lib/study/types";
import { parseCsvRecords } from "@/lib/study/csv";

interface ExperimentManagerProps {
  demo: boolean;
  onNotice: (message: string) => void;
}

interface ExperimentListResponse {
  experiments: ExperimentBatch[];
}

interface ExperimentDetailResponse {
  experiment: ExperimentBatch;
  enrollments: Enrollment[];
  readiness?: {
    enrollmentCount: number;
    missingConsentCount: number;
    activeSessionCount: number;
    canActivate: boolean;
    canClose: boolean;
  };
}

const demoExperiments: ExperimentBatch[] = [
  {
    id: "demo-batch-001",
    code: "SPRING-2026",
    name: "Spring speaking study",
    mode: "test",
    status: "active",
    configVersion: "study-2026-v1",
    vocabularyVersion: "vocabulary-2026-v1",
    thresholds: {
      minimumWordCount: 3,
      accuracy: 0.6,
      fluency: 0.6,
      emotionMinimumScore: 0.4,
      emotionMaximumRank: 3,
      maximumAttempts: 3,
      maximumRecordingSeconds: 30,
    },
    consentVersion: "consent-2026-v1",
    allocationMethod: "permuted-block-4-6",
    participantCodePrefix: "SPRING",
    rosterSize: 12,
    createdAt: "2026-09-01T08:00:00.000Z",
    createdBy: "demo-researcher",
    activatedAt: "2026-09-02T08:00:00.000Z",
    activatedBy: "demo-researcher",
  },
];

const statusLabel: Record<ExperimentBatch["status"], string> = {
  draft: "Draft",
  active: "Active",
  closed: "Closed",
  archived: "Archived",
};

function localDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW");
}

export function ExperimentManager({ demo, onNotice }: ExperimentManagerProps) {
  const [experiments, setExperiments] = useState<ExperimentBatch[]>(demo ? demoExperiments : []);
  const [selectedId, setSelectedId] = useState<string | null>(demo ? demoExperiments[0]?.id ?? null : null);
  const [selected, setSelected] = useState<ExperimentDetailResponse | null>(
    demo && demoExperiments[0]
      ? { experiment: demoExperiments[0], enrollments: [] }
      : null,
  );
  const [loading, setLoading] = useState(!demo);
  const [submitting, setSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [rosterText, setRosterText] = useState("participantCode,classId,consentVersion,consentedAt\n,CLASS-A,consent-2026-v1,");
  const [form, setForm] = useState({
    code: "",
    name: "",
    mode: "test" as "test" | "formal",
    consentVersion: "consent-2026-v1",
    participantCodePrefix: "STUDY",
  });

  const selectedExperiment = useMemo(
    () => experiments.find((experiment) => experiment.id === selectedId) ?? selected?.experiment ?? null,
    [experiments, selected?.experiment, selectedId],
  );

  async function load() {
    if (demo) return;
    setLoading(true);
    try {
      const payload = await apiFetch<ExperimentListResponse>("/api/admin/experiments");
      setExperiments(payload.experiments);
      const nextId = selectedId && payload.experiments.some((item) => item.id === selectedId)
        ? selectedId
        : payload.experiments[0]?.id ?? null;
      setSelectedId(nextId);
      if (nextId) await loadDetail(nextId);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Failed to load experiment batches.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(experimentId: string) {
    if (demo) {
      const item = experiments.find((experiment) => experiment.id === experimentId) ?? demoExperiments[0];
      if (item) setSelected({ experiment: item, enrollments: [] });
      return;
    }
    try {
      setSelected(await apiFetch<ExperimentDetailResponse>(`/api/admin/experiments/${experimentId}`));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Failed to load the selected batch.");
    }
  }

  useEffect(() => {
    void load();
    // The manager owns its initial fetch; selectedId changes are handled by the click handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  async function createExperiment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) {
      onNotice("Demo mode does not write experiment batches to Firebase.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = await apiFetch<{ experiment: ExperimentBatch }>("/api/admin/experiments", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ ...form, code: "", name: "" });
      setShowCreate(false);
      await load();
      setSelectedId(payload.experiment.id);
      await loadDetail(payload.experiment.id);
      onNotice(`Created experiment batch ${payload.experiment.code}.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Failed to create the experiment batch.");
    } finally {
      setSubmitting(false);
    }
  }

  async function transition(action: "activate" | "close" | "archive") {
    if (!selectedExperiment || demo) {
      if (demo) onNotice("Demo mode does not change experiment lifecycle state.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = await apiFetch<{ experiment: ExperimentBatch }>(
        `/api/admin/experiments/${selectedExperiment.id}/${action}`,
        { method: "POST" },
      );
      setSelected({ experiment: payload.experiment, enrollments: selected?.enrollments ?? [] });
      await load();
      onNotice(`Experiment batch ${payload.experiment.code} is now ${statusLabel[payload.experiment.status]}.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : `Failed to ${action} the experiment batch.`);
    } finally {
      setSubmitting(false);
    }
  }

  function parseRosterText(): Array<Record<string, string>> {
    return parseCsvRecords(rosterText);
  }

  async function issueEnrollments() {
    if (!selectedExperiment || selectedExperiment.status !== "draft") return;
    if (demo) {
      onNotice("Demo mode does not issue participant accounts.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiFetch<{ credentialsCsv: string; enrollmentCount: number }>(
        `/api/admin/experiments/${selectedExperiment.id}/enrollments`,
        {
          method: "POST",
          headers: { "idempotency-key": crypto.randomUUID() },
          body: JSON.stringify({ rows: parseRosterText() }),
        },
      );
      const blob = new Blob([result.credentialsCsv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selectedExperiment.code.toLowerCase()}-credentials.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setRosterText("");
      await load();
      await loadDetail(selectedExperiment.id);
      onNotice(`${result.enrollmentCount} accounts issued. The credential CSV was downloaded once; passwords are not stored.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Failed to issue enrollment accounts.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="experiment-workspace">
      <div className="admin-card experiment-toolbar">
        <div className="management-card-heading">
          <div className="management-card-heading__icon"><FlaskConical size={20} /></div>
          <div>
            <span>EXPERIMENT BATCHES</span>
            <h2>Define one controlled study run</h2>
            <p>Each batch locks its protocol, consent version, roster, allocation, and export scope.</p>
          </div>
        </div>
        <div className="experiment-toolbar__actions">
          <button className="secondary-button" onClick={() => void load()} disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
            Refresh
          </button>
          <button className="primary-button" onClick={() => setShowCreate((value) => !value)}>
            <Plus size={16} />
            New batch
          </button>
        </div>
      </div>

      {showCreate && (
        <form className="admin-card experiment-create-form" onSubmit={createExperiment}>
          <div className="card-heading"><strong>Create draft</strong><span>Only draft batches can be edited.</span></div>
          <div className="participant-form__row">
            <label><span>Batch code</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="SPRING-2026" required /></label>
            <label><span>Participant prefix</span><input value={form.participantCodePrefix} onChange={(event) => setForm({ ...form, participantCodePrefix: event.target.value.toUpperCase() })} placeholder="STUDY" required /></label>
          </div>
          <label><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Spring speaking study" required /></label>
          <div className="participant-form__row">
            <label><span>Mode</span><select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as "test" | "formal" })}><option value="test">Test</option><option value="formal">Formal</option></select></label>
            <label><span>Consent version</span><input value={form.consentVersion} onChange={(event) => setForm({ ...form, consentVersion: event.target.value })} required /></label>
          </div>
          <div className="participant-form__footer"><span>Activation requires a non-empty roster; formal batches require consent on every enrollment.</span><button className="primary-button" disabled={submitting} type="submit">{submitting ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Create draft</button></div>
        </form>
      )}

      <div className="experiment-grid">
        <div className="admin-card experiment-list">
          <div className="card-heading"><strong>Batch registry</strong><span>{experiments.length} batches</span></div>
          {experiments.length === 0 && <p className="empty-state">No experiment batches yet.</p>}
          {experiments.map((experiment) => (
            <button key={experiment.id} className={`experiment-list__item ${experiment.id === selectedId ? "is-active" : ""}`} onClick={() => { setSelectedId(experiment.id); void loadDetail(experiment.id); }}>
              <span className={`status-dot status-dot--${experiment.status}`} />
              <span><strong>{experiment.code}</strong><small>{experiment.name}</small></span>
              <b>{statusLabel[experiment.status]}</b>
            </button>
          ))}
        </div>

        <div className="admin-card experiment-detail">
          {!selectedExperiment ? <p className="empty-state">Select a batch to inspect its lifecycle.</p> : (
            <>
              <div className="card-heading"><div><span className="section-kicker">{selectedExperiment.mode.toUpperCase()} BATCH</span><strong>{selectedExperiment.name}</strong></div><span className={`status-pill status-pill--${selectedExperiment.status}`}>{statusLabel[selectedExperiment.status]}</span></div>
              <dl className="experiment-facts">
                <div><dt>Code</dt><dd>{selectedExperiment.code}</dd></div>
                <div><dt>Protocol</dt><dd>{selectedExperiment.configVersion}</dd></div>
                <div><dt>Vocabulary</dt><dd>{selectedExperiment.vocabularyVersion}</dd></div>
                <div><dt>Consent</dt><dd>{selectedExperiment.consentVersion}</dd></div>
                <div><dt>Roster</dt><dd>{selectedExperiment.rosterSize} enrolled</dd></div>
                <div><dt>Created</dt><dd>{localDate(selectedExperiment.createdAt)}</dd></div>
              </dl>
              <div className="experiment-actions">
                {selectedExperiment.status === "draft" && <button className="primary-button" disabled={submitting} onClick={() => void transition("activate")}><Play size={16} /> Activate</button>}
                {selectedExperiment.status === "active" && <button className="secondary-button" disabled={submitting} onClick={() => void transition("close")}><LockKeyhole size={16} /> Close</button>}
                {selectedExperiment.status === "closed" && <button className="secondary-button" disabled={submitting} onClick={() => void transition("archive")}><Archive size={16} /> Archive</button>}
                {selectedExperiment.status === "active" && <span className="experiment-hint"><CheckCircle2 size={15} /> Roster and protocol are locked after activation.</span>}
              </div>
              {selectedExperiment.status === "draft" && (
                <div className="experiment-enrollment-panel">
                  <div className="card-heading"><strong>Issue enrollment accounts</strong><span>{selected?.readiness?.enrollmentCount ?? selected?.enrollments.length ?? 0} currently enrolled</span></div>
                  <p>Paste CSV rows. Leave participantCode blank to generate the next batch-scoped code. Passwords are returned only in the one-time download.</p>
                  <textarea value={rosterText} onChange={(event) => setRosterText(event.target.value)} rows={5} spellCheck={false} />
                  <button className="secondary-button" disabled={submitting || !rosterText.trim()} onClick={() => void issueEnrollments()}><Download size={16} /> Issue accounts and download credentials</button>
                </div>
              )}
              {selected?.readiness && (
                <div className="experiment-readiness">
                  <span>{selected.readiness.missingConsentCount} missing consent</span>
                  <span>{selected.readiness.activeSessionCount} active sessions</span>
                  {!selected.readiness.canActivate && selectedExperiment.status === "draft" && <span>Activation is blocked until roster and consent checks pass.</span>}
                </div>
              )}
              <p className="experiment-detail__note">After activation, the roster and protocol are immutable. Use a new batch for a new cohort or protocol version.</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
