"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownToLine,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  CloudCog,
  Database,
  FileUp,
  Gauge,
  Headphones,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MessageSquareText,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Brand } from "./brand";
import { apiFetch } from "@/lib/client/api";
import { isFirebaseConfigured, signOutParticipant } from "@/lib/firebase/client";
import { STUDY_THRESHOLDS } from "@/lib/study/config";

const isDemoMode =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !isFirebaseConfigured;

interface Overview {
  metrics: {
    participants: number;
    activeSessions: number;
    completedSessions: number;
    completionRate: number;
    attempts: number;
    estimatedAudioGb: number;
  };
  groupCounts: { agent1: number; agent2: number };
  decisionCounts: Record<string, number>;
  nodeStats: Array<{
    nodeId: number;
    attempts: number;
    passRate: number;
    accuracy: number;
    fluency: number;
  }>;
  sessions: Array<Record<string, unknown>>;
  participants: Array<Record<string, unknown>>;
}

const demoOverview: Overview = {
  metrics: {
    participants: 40,
    activeSessions: 8,
    completedSessions: 27,
    completionRate: 77,
    attempts: 486,
    estimatedAudioGb: 0.31,
  },
  groupCounts: { agent1: 20, agent2: 20 },
  decisionCounts: {
    PASS: 352,
    TOO_SHORT: 48,
    OFF_TOPIC: 27,
    LOW_FLUENCY: 31,
    LOW_EMOTION: 18,
    CHINESE_OR_UNKNOWN: 10,
  },
  nodeStats: [
    { nodeId: 1, attempts: 103, passRate: 86, accuracy: 81, fluency: 77 },
    { nodeId: 2, attempts: 101, passRate: 79, accuracy: 76, fluency: 73 },
    { nodeId: 3, attempts: 98, passRate: 75, accuracy: 78, fluency: 70 },
    { nodeId: 4, attempts: 94, passRate: 72, accuracy: 74, fluency: 69 },
    { nodeId: 5, attempts: 90, passRate: 84, accuracy: 82, fluency: 78 },
  ],
  sessions: [
    {
      id: "demo-session-001",
      participantCode: "ANNA-021",
      classId: "Class 801",
      group: "agent1",
      nodeId: 5,
      status: "completed",
      updatedAt: "2026-07-27T12:42:00.000Z",
    },
    {
      id: "demo-session-002",
      participantCode: "ANNA-022",
      classId: "Class 801",
      group: "agent2",
      nodeId: 4,
      status: "active",
      updatedAt: "2026-07-27T12:39:00.000Z",
    },
    {
      id: "demo-session-003",
      participantCode: "ANNA-023",
      classId: "Class 801",
      group: "agent1",
      nodeId: 3,
      status: "active",
      updatedAt: "2026-07-27T12:35:00.000Z",
    },
    {
      id: "demo-session-004",
      participantCode: "ANNA-024",
      classId: "Class 801",
      group: "agent2",
      nodeId: 5,
      status: "awaiting_confirmation",
      updatedAt: "2026-07-27T12:31:00.000Z",
    },
  ],
  participants: Array.from({ length: 8 }, (_, index) => ({
    id: `demo-participant-${index + 1}`,
    code: `ANNA-${String(21 + index).padStart(3, "0")}`,
    classId: "Class 801",
    group: index % 2 ? "agent2" : "agent1",
    consentVersion: "consent-2026-v1",
  })),
};

const nodeNames = [
  "The Coronation",
  "The Ice Palace",
  "The Trolls",
  "Hans's Choice",
  "The Act of Love",
];

function formatTime(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
}

export function ResearchDashboard() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const vocabularyInput = useRef<HTMLInputElement | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [activeNav, setActiveNav] = useState<
    "overview" | "sessions" | "participants" | "settings"
  >("overview");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSession, setSelectedSession] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    exportId: string;
    csvUrl: string;
    jsonUrl: string;
    zipUrl?: string;
    wavZip?: { status: string };
  } | null>(null);

  async function load() {
    setLoading(true);
    try {
      if (isDemoMode) {
        setOverview(demoOverview);
      } else {
        setOverview(await apiFetch<Overview>("/api/admin/overview"));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "後台資料載入失敗。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const role = sessionStorage.getItem("olaf-role");
    if (!role) {
      router.replace("/");
      return;
    }
    void load();
  }, [router]);

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!overview || !query) return overview?.sessions ?? [];
    return overview.sessions.filter((session) =>
      JSON.stringify(session).toLowerCase().includes(query),
    );
  }, [overview, search]);

  const failureRows = useMemo(() => {
    if (!overview) return [];
    return Object.entries(overview.decisionCounts)
      .filter(([decision]) => decision !== "PASS")
      .sort(([, left], [, right]) => right - left);
  }, [overview]);

  async function exportData() {
    if (isDemoMode) {
      const blob = new Blob([JSON.stringify(demoOverview, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "adventure-diary-demo-export.json";
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    setExporting(true);
    try {
      const payload = await apiFetch<{
        exportId: string;
        jsonUrl: string;
        csvUrl: string;
        wavZip: { status: string };
      }>(
        "/api/admin/export",
        { method: "POST", body: "{}" },
      );
      setExportResult(payload);
      setNotice(
        payload.wavZip.status === "queued"
          ? "CSV／JSON 已建立；WAV ZIP 正在 Cloud Run 背景產生。"
          : "CSV／JSON 的五分鐘下載連結已建立；本環境未設定 WAV ZIP job。",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "匯出失敗。");
    } finally {
      setExporting(false);
    }
  }

  async function checkZipExport() {
    if (!exportResult) return;
    setExporting(true);
    try {
      const payload = await apiFetch<{
        wavZipStatus: string;
        zipUrl?: string;
        error?: string | null;
      }>(
        `/api/admin/export?exportId=${encodeURIComponent(exportResult.exportId)}`,
      );
      if (payload.zipUrl) {
        setExportResult((current) =>
          current ? { ...current, zipUrl: payload.zipUrl } : current,
        );
        setNotice("WAV ZIP 已完成；下載連結五分鐘內有效。");
      } else {
        setNotice(
          payload.error
            ? `WAV ZIP 失敗：${payload.error}`
            : `WAV ZIP 狀態：${payload.wavZipStatus}`,
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "無法查詢 ZIP 狀態。");
    } finally {
      setExporting(false);
    }
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const [headerLine, ...rows] = lines;
    const headers = headerLine.split(",").map((value) => value.trim());
    const participants = rows.map((line) => {
      const values = line.split(",").map((value) => value.trim());
      const row = Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""]),
      );
      return {
        code: row.code,
        password: row.password,
        classId: row.classId,
        consentVersion: row.consentVersion,
        consentedAt: row.consentedAt,
      };
    });
    if (isDemoMode) {
      setNotice(`已讀取 ${participants.length} 筆示範帳號；正式模式才會寫入 Firebase。`);
      return;
    }
    const payload = await apiFetch<{
      results: Array<{ uid?: string; error?: string }>;
    }>("/api/admin/participants/import", {
      method: "POST",
      body: JSON.stringify({ participants }),
    });
    setNotice(
      `匯入完成：${payload.results.filter((item) => item.uid).length} 筆成功。`,
    );
    await load();
  }

  async function importVocabulary(file: File) {
    const text = await file.text();
    const words = text
      .split(/[\s,;\t]+/)
      .map((word) => word.replace(/^["']|["']$/g, "").trim())
      .filter(
        (word) =>
          Boolean(word) &&
          !["word", "words", "vocabulary"].includes(word.toLowerCase()),
      );
    if (isDemoMode) {
      setNotice(`已驗證 ${new Set(words).size} 個詞；正式模式才會發布新詞表版本。`);
      return;
    }
    const version = `grade8-${new Date()
      .toISOString()
      .slice(0, 19)
      .replaceAll(/[-:T]/g, "")}`;
    const payload = await apiFetch<{ version: string; wordCount: number }>(
      "/api/admin/config/vocabulary",
      {
        method: "POST",
        body: JSON.stringify({ version, words }),
      },
    );
    setNotice(
      `詞表 ${payload.version} 已發布，共 ${payload.wordCount} 個有效英文詞；新場次將鎖定此版本。`,
    );
  }

  async function leave() {
    await signOutParticipant();
    sessionStorage.clear();
    router.push("/");
  }

  if (loading || !overview) {
    return (
      <main className="loading-page">
        <LoaderCircle className="spin" size={28} />
        <p>正在整理研究資料…</p>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside className="admin-nav">
        <Brand compact />
        <nav>
          <span>RESEARCH</span>
          <button
            className={activeNav === "overview" ? "is-active" : ""}
            onClick={() => setActiveNav("overview")}
          >
            <LayoutDashboard size={18} />
            總覽
          </button>
          <button
            className={activeNav === "sessions" ? "is-active" : ""}
            onClick={() => setActiveNav("sessions")}
          >
            <ClipboardList size={18} />
            學習場次
            <b>{overview.metrics.activeSessions}</b>
          </button>
          <button
            className={activeNav === "participants" ? "is-active" : ""}
            onClick={() => setActiveNav("participants")}
          >
            <Users size={18} />
            受試者
          </button>
          <span>MANAGE</span>
          <button
            className={activeNav === "settings" ? "is-active" : ""}
            onClick={() => setActiveNav("settings")}
          >
            <Settings2 size={18} />
            研究設定
          </button>
        </nav>
        <div className="admin-nav__status">
          <CloudCog size={18} />
          <div>
            <strong>{isDemoMode ? "Demo data" : "Cloud connected"}</strong>
            <span>{isDemoMode ? "Browser-only preview" : "Firebase · Azure"}</span>
          </div>
        </div>
        <button className="admin-logout" onClick={() => void leave()}>
          <LogOut size={17} />
          登出研究後台
        </button>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div className="admin-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜尋受試者、班級或場次…"
            />
          </div>
          <div className="admin-topbar__actions">
            <button className="secondary-button" onClick={() => void load()}>
              <RefreshCw size={16} />
              更新
            </button>
            <button
              className="primary-button"
              onClick={() => void exportData()}
              disabled={exporting}
            >
              {exporting ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <ArrowDownToLine size={17} />
              )}
              匯出研究資料
            </button>
          </div>
        </header>

        <div className="admin-content">
          {notice && (
            <div className="admin-notice">
              <CircleAlert size={17} />
              <span>{notice}</span>
              <button onClick={() => setNotice(null)}>
                <X size={15} />
              </button>
            </div>
          )}
          {exportResult && (
            <div className="export-links">
              <strong>匯出 {exportResult.exportId}</strong>
              <a href={exportResult.csvUrl} target="_blank" rel="noreferrer">
                下載 CSV
              </a>
              <a href={exportResult.jsonUrl} target="_blank" rel="noreferrer">
                下載 JSON
              </a>
              {exportResult.zipUrl ? (
                <a href={exportResult.zipUrl} target="_blank" rel="noreferrer">
                  下載 WAV ZIP
                </a>
              ) : exportResult.wavZip?.status === "queued" ? (
                <button onClick={() => void checkZipExport()}>
                  查詢 WAV ZIP
                </button>
              ) : null}
              <button onClick={() => setExportResult(null)}>
                <X size={14} />
              </button>
            </div>
          )}

          <div className="admin-title">
            <div>
              <span className="section-kicker">
                {activeNav === "overview"
                  ? "LIVE STUDY OVERVIEW"
                  : activeNav.toUpperCase()}
              </span>
              <h1>
                {activeNav === "overview" && "研究進度總覽"}
                {activeNav === "sessions" && "學習場次"}
                {activeNav === "participants" && "受試者管理"}
                {activeNav === "settings" && "研究設定"}
              </h1>
              <p>
                {activeNav === "overview"
                  ? "掌握五個節點的完成情形、語音評量與實驗組平衡。"
                  : "所有異動都會留下版本或稽核紀錄，不覆寫原始研究資料。"}
              </p>
            </div>
            <div className="study-live">
              <i />
              STUDY RUNNING
            </div>
          </div>

          {activeNav === "overview" && (
            <>
              <section className="metric-grid">
                <MetricCard
                  icon={<Users size={20} />}
                  label="受試者"
                  value={overview.metrics.participants}
                  detail="已建立研究帳號"
                  tone="blue"
                />
                <MetricCard
                  icon={<Activity size={20} />}
                  label="進行中"
                  value={overview.metrics.activeSessions}
                  detail="目前活躍場次"
                  tone="yellow"
                />
                <MetricCard
                  icon={<BookOpenCheck size={20} />}
                  label="完成率"
                  value={`${overview.metrics.completionRate}%`}
                  detail={`${overview.metrics.completedSessions} 份完整日記`}
                  tone="green"
                />
                <MetricCard
                  icon={<Database size={20} />}
                  label="音檔估算"
                  value={`${overview.metrics.estimatedAudioGb} GB`}
                  detail={`${overview.metrics.attempts} 次有效嘗試`}
                  tone="purple"
                />
              </section>

              <section className="admin-grid admin-grid--wide">
                <article className="admin-card">
                  <CardHeading
                    title="五節點表現"
                    subtitle="通過率、Accuracy 與 Fluency"
                    icon={<BarChart3 size={18} />}
                  />
                  <div className="node-performance">
                    {overview.nodeStats.map((node) => (
                      <div key={node.nodeId} className="node-performance__row">
                        <div className="node-label">
                          <span>{node.nodeId}</span>
                          <div>
                            <strong>{nodeNames[node.nodeId - 1]}</strong>
                            <small>{node.attempts} attempts</small>
                          </div>
                        </div>
                        <ScoreBar label="PASS" value={node.passRate} color="blue" />
                        <ScoreBar label="ACC." value={node.accuracy} color="green" />
                        <ScoreBar label="FLU." value={node.fluency} color="yellow" />
                      </div>
                    ))}
                  </div>
                </article>

                <article className="admin-card">
                  <CardHeading
                    title="實驗組平衡"
                    subtitle="班級內 1:1 可變區塊隨機"
                    icon={<Gauge size={18} />}
                  />
                  <div className="group-balance">
                    <div
                      className="group-donut"
                      style={{
                        "--agent-one": `${Math.round(
                          (overview.groupCounts.agent1 /
                            Math.max(
                              1,
                              overview.groupCounts.agent1 +
                                overview.groupCounts.agent2,
                            )) *
                            100,
                        )}%`,
                      } as React.CSSProperties}
                    >
                      <div>
                        <strong>
                          {overview.groupCounts.agent1 +
                            overview.groupCounts.agent2}
                        </strong>
                        <span>assigned</span>
                      </div>
                    </div>
                    <div className="group-legend">
                      <div>
                        <i className="agent-one" />
                        <span>Agent 1 · 語言鷹架</span>
                        <strong>{overview.groupCounts.agent1}</strong>
                      </div>
                      <div>
                        <i className="agent-two" />
                        <span>Agent 2 · 情緒鷹架</span>
                        <strong>{overview.groupCounts.agent2}</strong>
                      </div>
                    </div>
                  </div>
                </article>
              </section>

              <section className="admin-grid">
                <article className="admin-card">
                  <CardHeading
                    title="需要重試的原因"
                    subtitle="不含技術錯誤與通過紀錄"
                    icon={<CircleAlert size={18} />}
                  />
                  <div className="failure-list">
                    {failureRows.map(([decision, count]) => {
                      const max = Math.max(...failureRows.map(([, value]) => value));
                      return (
                        <div key={decision}>
                          <span>{decision.replaceAll("_", " ")}</span>
                          <div>
                            <i style={{ width: `${(count / max) * 100}%` }} />
                          </div>
                          <strong>{count}</strong>
                        </div>
                      );
                    })}
                  </div>
                </article>

                <article className="admin-card">
                  <CardHeading
                    title="資料完整性"
                    subtitle="雲端研究資料保護"
                    icon={<ShieldCheck size={18} />}
                  />
                  <div className="integrity-list">
                    {[
                      ["原始 WAV 保存", "所有有效與失敗嘗試"],
                      ["流程版本鎖定", "prototype-2026-07-v1"],
                      ["個資最小化", "僅保存研究代碼"],
                      ["自動刪除", "關閉"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <CheckCircle2 size={17} />
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            </>
          )}

          {(activeNav === "overview" || activeNav === "sessions") && (
            <section className="admin-card sessions-card">
              <CardHeading
                title="最近學習場次"
                subtitle="點選場次查看逐輪紀錄與音檔"
                icon={<ClipboardList size={18} />}
              />
              <SessionTable
                sessions={filteredSessions}
                onSelect={setSelectedSession}
              />
            </section>
          )}

          {activeNav === "participants" && (
            <section className="admin-grid admin-grid--participants">
              <article className="admin-card upload-card">
                <div className="upload-icon">
                  <FileUp size={26} />
                </div>
                <h2>批次匯入受試者</h2>
                <p>
                  CSV 欄位：code、password、classId、consentVersion、consentedAt。
                  分組會在首次開始場次時由伺服器鎖定。
                </p>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importCsv(file);
                  }}
                />
                <button
                  className="primary-button"
                  onClick={() => fileInput.current?.click()}
                >
                  <FileUp size={17} />
                  選擇 CSV
                </button>
              </article>
              <article className="admin-card participant-list">
                <CardHeading
                  title="已建立帳號"
                  subtitle={`${overview.participants.length} 筆顯示中`}
                  icon={<Users size={18} />}
                />
                {overview.participants.map((participant) => (
                  <div key={String(participant.id)}>
                    <span>{String(participant.code).slice(-2)}</span>
                    <div>
                      <strong>{String(participant.code)}</strong>
                      <small>{String(participant.classId)}</small>
                    </div>
                    <b>{String(participant.group ?? "待分派")}</b>
                  </div>
                ))}
              </article>
            </section>
          )}

          {activeNav === "settings" && (
            <section className="admin-grid">
              <article className="admin-card settings-card">
                <CardHeading
                  title="原型判定門檻"
                  subtitle="正式變更時建立新設定版本"
                  icon={<Settings2 size={18} />}
                />
                {[
                  ["每輪最低英文詞數", STUDY_THRESHOLDS.minimumWordCount],
                  ["Accuracy", STUDY_THRESHOLDS.accuracy],
                  ["Fluency", STUDY_THRESHOLDS.fluency],
                  ["emotion2vec 信心值", STUDY_THRESHOLDS.emotionMinimumScore],
                  ["每輪有效嘗試上限", STUDY_THRESHOLDS.maximumAttempts],
                  ["錄音秒數上限", STUDY_THRESHOLDS.maximumRecordingSeconds],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
                <input
                  ref={vocabularyInput}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importVocabulary(file);
                  }}
                />
                <button
                  className="secondary-button settings-import"
                  onClick={() => vocabularyInput.current?.click()}
                >
                  <FileUp size={16} />
                  匯入並發布 1200 單字
                </button>
              </article>
              <article className="admin-card settings-card">
                <CardHeading
                  title="服務狀態"
                  subtitle="部署環境與模型版本"
                  icon={<CloudCog size={18} />}
                />
                {[
                  ["Application", isDemoMode ? "Demo mode" : "Vercel"],
                  ["Structured data", isDemoMode ? "Browser" : "Firestore"],
                  ["Speech", isDemoMode ? "Browser fallback" : "Azure Speech"],
                  ["Semantic model", "gpt-5-mini"],
                  ["Emotion model", "emotion2vec+ base"],
                  ["Vocabulary", "prototype-core-v1"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </article>
            </section>
          )}
        </div>
      </section>

      {selectedSession && (
        <SessionDrawer
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: string;
  tone: string;
}) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function CardHeading({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card-heading">
      <div className="card-heading__icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="score-bar">
      <span>{label}</span>
      <div>
        <i
          className={`score-bar--${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function SessionTable({
  sessions,
  onSelect,
}: {
  sessions: Array<Record<string, unknown>>;
  onSelect: (session: Record<string, unknown>) => void;
}) {
  return (
    <div className="session-table-wrap">
      <table className="session-table">
        <thead>
          <tr>
            <th>受試者</th>
            <th>班級</th>
            <th>實驗組</th>
            <th>目前節點</th>
            <th>狀態</th>
            <th>更新時間</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={String(session.id)}>
              <td>
                <strong>{String(session.participantCode ?? "—")}</strong>
              </td>
              <td>{String(session.classId ?? "—")}</td>
              <td>
                <span className={`group-tag ${String(session.group)}`}>
                  {session.group === "agent2" ? "Agent 2" : "Agent 1"}
                </span>
              </td>
              <td>
                Page {String(session.nodeId ?? "—")} ·{" "}
                {nodeNames[Number(session.nodeId ?? 1) - 1]}
              </td>
              <td>
                <span className={`session-status ${String(session.status)}`}>
                  {String(session.status).replaceAll("_", " ")}
                </span>
              </td>
              <td>{formatTime(session.updatedAt)}</td>
              <td>
                <button onClick={() => onSelect(session)} aria-label="查看場次">
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionDrawer({
  session,
  onClose,
}: {
  session: Record<string, unknown>;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<{
    attempts: Array<Record<string, unknown>>;
    messages: Array<Record<string, unknown>>;
    worksheet: Array<Record<string, unknown>>;
    notes: Array<Record<string, unknown>>;
  } | null>(null);
  const [loading, setLoading] = useState(!isDemoMode);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (isDemoMode) {
      setDetail({
        attempts: [
          {
            id: "demo-attempt-1",
            nodeId: 1,
            round: "plot",
            status: "passed",
            decision: "PASS",
            transcript:
              "Elsa removed her glove, lost control of her magic, and ran away.",
            wordCount: 11,
            speechScores: { accuracy: 84, fluency: 80, prosody: 76 },
          },
          {
            id: "demo-attempt-2",
            nodeId: 1,
            round: "feeling",
            status: "passed",
            decision: "PASS",
            transcript:
              "I felt very surprised and scared when ice filled the royal room.",
            wordCount: 12,
            speechScores: { accuracy: 81, fluency: 78, prosody: 74 },
          },
        ],
        messages: [],
        worksheet: [],
        notes: [],
      });
      return;
    }
    void apiFetch<{
      attempts: Array<Record<string, unknown>>;
      messages: Array<Record<string, unknown>>;
      worksheet: Array<Record<string, unknown>>;
      notes: Array<Record<string, unknown>>;
    }>(`/api/admin/sessions/${String(session.id)}`)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [session.id]);

  async function playAudio(path: string) {
    if (isDemoMode) return;
    const payload = await apiFetch<{ url: string }>(
      `/api/admin/audio?path=${encodeURIComponent(path)}`,
    );
    setAudioUrl(payload.url);
  }

  async function saveNote() {
    const text = noteText.trim();
    if (!text || isDemoMode) return;
    setSavingNote(true);
    try {
      const payload = await apiFetch<{
        note: Record<string, unknown>;
      }>(`/api/admin/sessions/${String(session.id)}/notes`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setDetail((current) =>
        current
          ? { ...current, notes: [...current.notes, payload.note] }
          : current,
      );
      setNoteText("");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="session-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="session-drawer__head">
          <div>
            <span className="section-kicker">SESSION DETAIL</span>
            <h2>{String(session.participantCode)}</h2>
          </div>
          <button onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div className="session-summary">
          <div>
            <span>GROUP</span>
            <strong>{String(session.group)}</strong>
          </div>
          <div>
            <span>STATUS</span>
            <strong>{String(session.status).replaceAll("_", " ")}</strong>
          </div>
          <div>
            <span>NODE</span>
            <strong>Page {String(session.nodeId)}</strong>
          </div>
        </div>
        {loading ? (
          <div className="drawer-placeholder">
            <LoaderCircle className="spin" size={25} />
            <h3>正在讀取逐輪資料</h3>
          </div>
        ) : (
          <div className="attempt-timeline">
            {detail?.attempts.map((attempt) => {
              const scores = (attempt.speechScores ?? {}) as Record<
                string,
                unknown
              >;
              return (
                <article key={String(attempt.id)}>
                  <div className="attempt-timeline__top">
                    <span>
                      PAGE {String(attempt.nodeId)} ·{" "}
                      {String(attempt.round).toUpperCase()}
                    </span>
                    <strong className={String(attempt.status)}>
                      {String(attempt.decision)}
                    </strong>
                  </div>
                  <p>{String(attempt.transcript || "(No transcript)")}</p>
                  <div className="attempt-scores">
                    <span>Words <b>{String(attempt.wordCount ?? "—")}</b></span>
                    <span>Accuracy <b>{String(scores.accuracy ?? "—")}</b></span>
                    <span>Fluency <b>{String(scores.fluency ?? "—")}</b></span>
                    <span>Prosody <b>{String(scores.prosody ?? "—")}</b></span>
                  </div>
                  {Boolean(attempt.storagePath) && (
                    <button
                      className="audio-link"
                      onClick={() => void playAudio(String(attempt.storagePath))}
                    >
                      <Headphones size={14} />
                      {isDemoMode ? "示範模式無雲端音檔" : "播放私密 WAV"}
                    </button>
                  )}
                </article>
              );
            })}
            {!detail?.attempts.length && (
              <div className="drawer-placeholder">
                <Headphones size={28} />
                <h3>尚無送出紀錄</h3>
                <p>學生完成第一次錄音後，逐字稿與分數會顯示在這裡。</p>
              </div>
            )}
          </div>
        )}
        <section className="research-notes">
          <div className="research-notes__title">
            <MessageSquareText size={16} />
            <strong>研究者註記</strong>
            <span>不會覆寫原始資料</span>
          </div>
          {detail?.notes.map((note) => (
            <article key={String(note.id)}>
              <p>{String(note.text)}</p>
              <time>{formatTime(note.createdAt)}</time>
            </article>
          ))}
          {isDemoMode ? (
            <p className="research-notes__demo">正式模式可新增具稽核紀錄的註記。</p>
          ) : (
            <div className="research-note-form">
              <textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="輸入觀察註記…"
                maxLength={2000}
              />
              <button
                className="secondary-button"
                onClick={() => void saveNote()}
                disabled={!noteText.trim() || savingNote}
              >
                {savingNote ? "保存中…" : "保存註記"}
              </button>
            </div>
          )}
        </section>
        {audioUrl && (
          <div className="audio-player">
            <audio src={audioUrl} controls autoPlay />
            <button onClick={() => setAudioUrl(null)}>
              <X size={14} />
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
