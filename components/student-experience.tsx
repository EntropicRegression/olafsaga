"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Cloud,
  CloudOff,
  LoaderCircle,
  LogOut,
  Mic,
  Radio,
  RotateCcw,
  ShieldCheck,
  Square,
  TestTube2,
  Wifi,
} from "lucide-react";
import { Brand } from "./brand";
import { ChatBubble } from "./chat-bubble";
import { DiaryPanel } from "./diary-panel";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { apiFetch } from "@/lib/client/api";
import {
  deletePendingAudio,
  listPendingAudio,
  savePendingAudio,
} from "@/lib/client/offline-audio";
import {
  isFirebaseConfigured,
  signOutParticipant,
  uploadWav,
} from "@/lib/firebase/client";
import {
  confirmDemoWorksheet,
  getDemoSample,
  loadDemoState,
  resetDemoState,
  retryDemoWorksheet,
  saveDemoState,
  submitDemoAttempt,
  type DemoStudyState,
} from "@/lib/demo/store";
import { encodeWav } from "@/lib/audio/wav";
import { getNode } from "@/lib/study/config";
import { getCompletionReply, getPrompt } from "@/lib/study/templates";
import type {
  AttemptResult,
  ChatMessage,
  NodeId,
  SpeechScores,
  StudySession,
  WorksheetEntry,
} from "@/lib/study/types";

const isDemoMode =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !isFirebaseConfigured;

interface FormalState {
  session: StudySession;
  messages: ChatMessage[];
  worksheet: WorksheetEntry[];
}

interface AttemptReservation {
  id: string;
  storagePath: string;
}

interface CapturedRecording {
  wav: Blob;
  transcript: string;
  durationMs: number;
  speechScores: SpeechScores;
}

function message(
  role: "student" | "olaf",
  text: string,
  session: StudySession,
  extras: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    nodeId: session.nodeId,
    round: session.round,
    createdAt: new Date().toISOString(),
    ...extras,
  };
}

export function StudentExperience() {
  const router = useRouter();
  const scrollAnchor = useRef<HTMLDivElement | null>(null);
  const stopping = useRef(false);
  const starting = useRef(false);
  const resumingQueue = useRef(false);
  const [code, setCode] = useState("");
  const [demoState, setDemoState] = useState<DemoStudyState | null>(null);
  const [formalState, setFormalState] = useState<FormalState | null>(null);
  const [reservation, setReservation] = useState<AttemptReservation | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [samplePanel, setSamplePanel] = useState(false);
  const [online, setOnline] = useState(true);
  const [pendingUploads, setPendingUploads] = useState(0);

  const activeState = demoState ?? formalState;
  const session = activeState?.session;
  const recordingLimit = session?.thresholds.maximumRecordingSeconds ?? 30;
  const recorder = useAudioRecorder({
    maximumSeconds: recordingLimit,
    demoCode: code,
  });
  const messages = activeState?.messages ?? [];
  const worksheet = useMemo(
    () => activeState?.worksheet ?? [],
    [activeState?.worksheet],
  );
  const currentDiary = session?.awaitingWorksheetNodeId
    ? worksheet.find((entry) => entry.nodeId === session.awaitingWorksheetNodeId)
    : undefined;

  const formalSessionId = formalState?.session.id;

  useEffect(() => {
    const storedCode = sessionStorage.getItem("olaf-participant-code");
    if (!storedCode) {
      router.replace("/");
      return;
    }
    setCode(storedCode);
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (isDemoMode) {
      setDemoState(loadDemoState(storedCode));
      setLoading(false);
    } else {
      void apiFetch<{
        session: StudySession;
        messages: ChatMessage[];
        worksheet: WorksheetEntry[];
      }>("/api/session", { method: "POST", body: "{}" })
        .then((payload) => {
          const defaultWorksheet = ([1, 2, 3, 4, 5] as NodeId[]).map(
            (nodeId) =>
              payload.worksheet.find((entry) => entry.nodeId === nodeId) ?? {
                nodeId,
                storySummary: "",
                emotionWord: "",
                status: "pending" as const,
              },
          );
          setFormalState({
            session: payload.session,
            messages: payload.messages,
            worksheet: defaultWorksheet,
          });
        })
        .catch((error) => setNotice(error.message))
        .finally(() => setLoading(false));
    }
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [router]);

  useEffect(() => {
    scrollAnchor.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, recorder.interimTranscript]);

  const persistDemo = useCallback((next: DemoStudyState) => {
    setDemoState(next);
    saveDemoState(next);
  }, []);

  const beginRecording = useCallback(async () => {
    if (
      !session ||
      session.status !== "active" ||
      processing ||
      pendingUploads > 0 ||
      starting.current
    ) {
      return;
    }
    starting.current = true;
    setNotice(null);
    setUploadProgress(0);
    let nextReservation: AttemptReservation | null = null;
    try {
      if (isDemoMode) {
        const id = crypto.randomUUID();
        nextReservation = {
          id,
          storagePath: `demo-audio/${session.participantId}/${session.id}/${session.nodeId}-${session.round}-${id}.wav`,
        };
      } else {
        nextReservation = await apiFetch<AttemptReservation>("/api/attempts", {
          method: "POST",
          body: JSON.stringify({ sessionId: session.id }),
        });
      }
      setReservation(nextReservation);
      await recorder.start();
    } catch (error) {
      if (!isDemoMode && nextReservation && session) {
        try {
          const payload = await apiFetch<{
            session: StudySession;
          }>(`/api/attempts/${nextReservation.id}/complete`, {
            method: "POST",
            body: JSON.stringify({
              sessionId: session.id,
              technicalError:
                error instanceof Error
                  ? error.message
                  : "Microphone could not be started.",
              transcript: "",
              durationMs: 0,
              speechScores: {
                accuracy: null,
                fluency: null,
                prosody: null,
                monotone: false,
              },
            }),
          });
          setFormalState((current) =>
            current ? { ...current, session: payload.session } : current,
          );
        } catch {
          // The original microphone error remains the useful message. A
          // server-side created attempt is retained for audit if this call fails.
        }
      }
      setReservation(null);
      setNotice(
        error instanceof Error ? error.message : "無法啟動麥克風，請再試一次。",
      );
    } finally {
      starting.current = false;
    }
  }, [pendingUploads, processing, recorder, session]);

  const appendFormalResult = useCallback(
    (
      captured: CapturedRecording,
      result: AttemptResult,
      nextSession: StudySession,
    ) => {
      setFormalState((current) => {
        if (!current) return current;
        const previousSession = current.session;
        const nextMessages = [
          ...current.messages,
          message("student", captured.transcript || "(No speech detected)", previousSession),
          message("olaf", result.reply, previousSession, {
            templateId: result.replyTemplateId,
            toneHint: result.toneHint,
          }),
        ];
        let nextWorksheet = [...current.worksheet];
        if (
          previousSession.round === "plot" &&
          result.status === "passed"
        ) {
          const prompt = getPrompt(previousSession.nodeId, "feeling");
          nextMessages.push(
            message("olaf", prompt.text, {
              ...previousSession,
              round: "feeling",
            }, {
              templateId: prompt.id,
              toneHint: prompt.toneHint,
            }),
          );
        }
        if (
          previousSession.round === "feeling" &&
          (result.status === "passed" || result.status === "forced_advance")
        ) {
          const plotTranscript = [...current.messages]
            .reverse()
            .find(
              (item) =>
                item.role === "student" &&
                item.nodeId === previousSession.nodeId &&
                item.round === "plot",
            )?.text;
          const entry: WorksheetEntry = {
            nodeId: previousSession.nodeId,
            storySummary: result.forcedAdvance ? "" : plotTranscript ?? "",
            emotionWord: result.forcedAdvance
              ? ""
              : getNode(previousSession.nodeId).targetEmotion,
            status: result.forcedAdvance ? "assisted" : "ready",
          };
          nextWorksheet = [
            ...nextWorksheet.filter((item) => item.nodeId !== entry.nodeId),
            entry,
          ].sort((a, b) => a.nodeId - b.nodeId);
        }
        return {
          session: nextSession,
          messages: nextMessages,
          worksheet: nextWorksheet,
        };
      });
    },
    [],
  );

  const submitCaptured = useCallback(
    async (
      captured: CapturedRecording,
      demoEmotionPassed = true,
    ): Promise<void> => {
      if (!session || !reservation) return;
      setProcessing(true);
      setNotice(null);
      const pendingId = reservation.id;
      const metadata = {
        sessionId: session.id,
        nodeId: String(session.nodeId),
        round: session.round,
        attemptNumber: String(session.attemptNumber),
      };
      try {
        await savePendingAudio({
          id: pendingId,
          blob: captured.wav,
          storagePath: reservation.storagePath,
          metadata,
          analysis: {
            transcript: captured.transcript,
            durationMs: captured.durationMs,
            speechScores: captured.speechScores,
          },
          createdAt: new Date().toISOString(),
        });
        setPendingUploads((count) => count + 1);
        if (isDemoMode) {
          if (!demoState) return;
          const next = submitDemoAttempt(
            demoState,
            {
              transcript: captured.transcript,
              durationMs: captured.durationMs,
              audioPath: reservation.storagePath,
              speechScores: {
                accuracy: captured.speechScores.accuracy ?? 82,
                fluency: captured.speechScores.fluency ?? 78,
                prosody: captured.speechScores.prosody ?? 74,
                monotone: !demoEmotionPassed,
                raw: captured.speechScores.raw,
              },
            },
            demoEmotionPassed,
          );
          persistDemo(next);
          await deletePendingAudio(pendingId);
          setPendingUploads((count) => Math.max(0, count - 1));
          setNotice("示範錄音與評量資料已保存在此瀏覽器。");
        } else {
          await uploadWav(
            reservation.storagePath,
            captured.wav,
            metadata,
            setUploadProgress,
          );
          const payload = await apiFetch<{
            result: AttemptResult;
            session: StudySession;
          }>(`/api/attempts/${reservation.id}/complete`, {
            method: "POST",
            body: JSON.stringify({
              sessionId: session.id,
              transcript: captured.transcript,
              durationMs: captured.durationMs,
              speechScores: captured.speechScores,
            }),
          });
          appendFormalResult(captured, payload.result, payload.session);
          await deletePendingAudio(pendingId);
          setPendingUploads((count) => Math.max(0, count - 1));
        }
      } catch (error) {
        setNotice(
          online
            ? error instanceof Error
              ? error.message
              : "分析暫時失敗，錄音仍保存在離線佇列。"
            : "目前沒有網路，錄音已安全保存在這台裝置。",
        );
      } finally {
        setProcessing(false);
        setReservation(null);
        setUploadProgress(0);
      }
    },
    [
      appendFormalResult,
      demoState,
      online,
      persistDemo,
      reservation,
      session,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function flushPendingQueue() {
      if (
        isDemoMode ||
        !online ||
        !formalSessionId ||
        resumingQueue.current
      ) {
        return;
      }
      const queued = (await listPendingAudio()).filter(
        (item) =>
          item.metadata.sessionId === formalSessionId && item.analysis,
      );
      if (cancelled) return;
      setPendingUploads(queued.length);
      if (!queued.length) return;

      resumingQueue.current = true;
      setProcessing(true);
      try {
        for (const item of queued) {
          if (cancelled || !item.analysis) break;
          await uploadWav(
            item.storagePath,
            item.blob,
            item.metadata,
            setUploadProgress,
          );
          const payload = await apiFetch<{
            result: AttemptResult;
            session: StudySession;
          }>(`/api/attempts/${item.id}/complete`, {
            method: "POST",
            body: JSON.stringify({
              sessionId: item.metadata.sessionId,
              ...item.analysis,
            }),
          });
          if (cancelled) break;
          appendFormalResult(
            {
              wav: item.blob,
              transcript: item.analysis.transcript,
              durationMs: item.analysis.durationMs,
              speechScores: item.analysis.speechScores,
            },
            payload.result,
            payload.session,
          );
          await deletePendingAudio(item.id);
          setPendingUploads((count) => Math.max(0, count - 1));
        }
        if (!cancelled) setNotice("離線錄音已安全同步到研究資料庫。");
      } catch (error) {
        if (!cancelled) {
          setNotice(
            error instanceof Error
              ? `待上傳錄音仍安全保存：${error.message}`
              : "待上傳錄音仍安全保存在這台裝置。",
          );
        }
      } finally {
        resumingQueue.current = false;
        if (!cancelled) {
          setProcessing(false);
          setUploadProgress(0);
        }
      }
    }

    void flushPendingQueue();
    if (online) {
      timer = setInterval(() => void flushPendingQueue(), 10_000);
    }
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [appendFormalResult, formalSessionId, online]);

  const stopRecording = useCallback(async () => {
    if (!recorder.isRecording || stopping.current) return;
    stopping.current = true;
    try {
      const captured = await recorder.stop();
      await submitCaptured(captured);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "錄音停止失敗，請再試一次。",
      );
    } finally {
      stopping.current = false;
    }
  }, [recorder, submitCaptured]);

  useEffect(() => {
    if (recorder.isRecording && recorder.elapsedSeconds >= recordingLimit) {
      void stopRecording();
    }
  }, [recorder.elapsedSeconds, recorder.isRecording, recordingLimit, stopRecording]);

  const runSample = useCallback(
    async (
      kind: "pass" | "short" | "off-topic" | "flat",
    ): Promise<void> => {
      if (!session || processing || !isDemoMode) return;
      const id = crypto.randomUUID();
      const sampleReservation = {
        id,
        storagePath: `demo-audio/${session.participantId}/${session.id}/${session.nodeId}-${session.round}-${id}.wav`,
      };
      setReservation(sampleReservation);
      const transcript = getDemoSample(
        session.nodeId,
        session.round,
        kind === "flat" ? "pass" : kind,
      );
      // Let the reservation state settle before the shared submission path runs.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const captured: CapturedRecording = {
        wav: encodeWav(new Float32Array(16_000), 16_000),
        transcript,
        durationMs: 4_500,
        speechScores: {
          accuracy: 84,
          fluency: 80,
          prosody: kind === "flat" ? 42 : 76,
          monotone: kind === "flat",
        },
      };
      if (!demoState) return;
      setProcessing(true);
      try {
        await savePendingAudio({
          id,
          blob: captured.wav,
          storagePath: sampleReservation.storagePath,
          metadata: {
            sessionId: session.id,
            nodeId: String(session.nodeId),
            round: session.round,
          },
          createdAt: new Date().toISOString(),
        });
        const next = submitDemoAttempt(
          demoState,
          {
            transcript,
            durationMs: captured.durationMs,
            audioPath: sampleReservation.storagePath,
            speechScores: captured.speechScores,
          },
          kind !== "flat",
        );
        persistDemo(next);
      } finally {
        setProcessing(false);
        setReservation(null);
        setSamplePanel(false);
      }
    },
    [demoState, persistDemo, processing, session],
  );

  const confirmDiary = useCallback(async () => {
    if (!session?.awaitingWorksheetNodeId) return;
    setProcessing(true);
    try {
      if (isDemoMode && demoState) {
        persistDemo(confirmDemoWorksheet(demoState));
      } else {
        const payload = await apiFetch<{ session: StudySession }>(
          "/api/worksheet/confirm",
          {
            method: "POST",
            body: JSON.stringify({
              sessionId: session.id,
              nodeId: session.awaitingWorksheetNodeId,
            }),
          },
        );
        setFormalState((current) => {
          if (!current) return current;
          const confirmedNode = session.awaitingWorksheetNodeId!;
          const nextMessages = [...current.messages];
          const template =
            payload.session.status === "completed"
              ? getCompletionReply(payload.session.group)
              : getPrompt(payload.session.nodeId, "plot");
          nextMessages.push(
            message(
              "olaf",
              template.text,
              payload.session.status === "completed"
                ? { ...payload.session, nodeId: 5, round: "feeling" }
                : payload.session,
              { templateId: template.id, toneHint: template.toneHint },
            ),
          );
          return {
            session: payload.session,
            messages: nextMessages,
            worksheet: current.worksheet.map((entry) =>
              entry.nodeId === confirmedNode
                ? { ...entry, status: "confirmed" }
                : entry,
            ),
          };
        });
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "日記確認失敗。");
    } finally {
      setProcessing(false);
    }
  }, [demoState, persistDemo, session]);

  const retryDiary = useCallback(async () => {
    if (!session?.awaitingWorksheetNodeId) return;
    setProcessing(true);
    try {
      if (isDemoMode && demoState) {
        persistDemo(retryDemoWorksheet(demoState));
      } else {
        const payload = await apiFetch<{ session: StudySession }>(
          "/api/worksheet/retry",
          {
            method: "POST",
            body: JSON.stringify({
              sessionId: session.id,
              nodeId: session.awaitingWorksheetNodeId,
            }),
          },
        );
        setFormalState((current) =>
          current
            ? {
                ...current,
                session: payload.session,
                worksheet: current.worksheet.map((entry) =>
                  entry.nodeId === session.awaitingWorksheetNodeId
                    ? { ...entry, status: "pending" }
                    : entry,
                ),
              }
            : current,
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "無法重新開啟錄音。");
    } finally {
      setProcessing(false);
    }
  }, [demoState, persistDemo, session]);

  const restartDemo = useCallback(() => {
    if (!code || !isDemoMode) return;
    persistDemo(resetDemoState(code));
  }, [code, persistDemo]);

  async function leave() {
    await signOutParticipant();
    sessionStorage.clear();
    router.push("/");
  }

  const progress = useMemo(() => {
    if (!session) return 0;
    if (session.status === "completed") return 100;
    const completed = worksheet.filter(
      (entry) => entry.status === "confirmed",
    ).length;
    const roundPart = session.round === "feeling" ? 0.5 : 0;
    return Math.round(((completed + roundPart) / 5) * 100);
  }, [session, worksheet]);

  if (loading || !session) {
    return (
      <main className="loading-page">
        <LoaderCircle className="spin" size={28} />
        <p>正在打開冒險日記…</p>
      </main>
    );
  }

  return (
    <main className="student-shell">
      <header className="app-header">
        <Brand compact />
        <div className="app-header__right">
          <div className={`network-chip ${online ? "" : "is-offline"}`}>
            {online ? <Wifi size={14} /> : <CloudOff size={14} />}
            {online ? "已連線" : "離線保存中"}
          </div>
          <div className="participant-chip">
            <span>PARTICIPANT</span>
            <strong>{code}</strong>
          </div>
          <button className="icon-button" onClick={() => void leave()} aria-label="登出">
            <LogOut size={19} />
          </button>
        </div>
      </header>

      <div className="student-layout">
        <aside className="journey-rail">
          <div className="journey-rail__head">
            <span className="section-kicker">YOUR JOURNEY</span>
            <strong>{progress}% complete</strong>
          </div>
          <div className="progress-track">
            <span style={{ height: `${progress}%` }} />
          </div>
          <ol>
            {([1, 2, 3, 4, 5] as NodeId[]).map((nodeId) => {
              const entry = worksheet.find((item) => item.nodeId === nodeId);
              const complete = entry?.status === "confirmed";
              const active =
                session.status !== "completed" && session.nodeId === nodeId;
              return (
                <li
                  key={nodeId}
                  className={`${complete ? "is-complete" : ""} ${active ? "is-active" : ""}`}
                >
                  <span>
                    {complete ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </span>
                  <div>
                    <small>PAGE {nodeId}</small>
                    <strong>{getNode(nodeId).title}</strong>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="privacy-card">
            <ShieldCheck size={18} />
            <p>每次錄音與評量結果都會保留，組別不會顯示在學生畫面。</p>
          </div>
        </aside>

        <section className="conversation-panel">
          <div className="conversation-heading">
            <div>
              <span className="section-kicker">
                PAGE {session.nodeId} · {getNode(session.nodeId).sceneLabel.toUpperCase()}
              </span>
              <h1>{getNode(session.nodeId).title}</h1>
            </div>
            <div className="round-chip">
              <span>{session.round === "plot" ? "01" : "02"}</span>
              <div>
                <small>CURRENT ROUND</small>
                <strong>
                  {session.round === "plot" ? "Story memory" : "Feeling voice"}
                </strong>
              </div>
            </div>
          </div>

          <div className="chat-scroll" aria-live="polite">
            <div className="date-divider">
              <span>ADVENTURE DIARY · TODAY</span>
            </div>
            {messages.map((item) => (
              <ChatBubble key={item.id} message={item} />
            ))}
            {recorder.isRecording && recorder.interimTranscript && (
              <ChatBubble
                message={message(
                  "student",
                  recorder.interimTranscript,
                  session,
                )}
              />
            )}
            {processing && (
              <div className="analysis-card">
                <LoaderCircle className="spin" size={20} />
                <div>
                  <strong>Saving your voice safely…</strong>
                  <span>
                    {uploadProgress > 0
                      ? `Upload ${Math.round(uploadProgress * 100)}%`
                      : "Checking story words and speaking flow"}
                  </span>
                </div>
              </div>
            )}
            <div ref={scrollAnchor} />
          </div>

          <div className="voice-dock">
            {notice && (
              <div className="inline-notice">
                {online ? <Cloud size={16} /> : <CloudOff size={16} />}
                <span>{notice}</span>
                <button onClick={() => setNotice(null)}>關閉</button>
              </div>
            )}
            <div className="voice-dock__content">
              <div className="record-state">
                <span className={recorder.isRecording ? "record-dot is-live" : "record-dot"} />
                <div>
                  <small>
                    {recorder.isRecording
                      ? "LISTENING NOW"
                      : processing
                        ? "ANALYZING"
                        : "YOUR TURN"}
                  </small>
                  <strong>
                    {recorder.isRecording
                      ? "Speak in English"
                      : session.status === "completed"
                        ? "Diary complete"
                        : "Tap once, then tell your story"}
                  </strong>
                </div>
              </div>

              <div className={`waveform ${recorder.isRecording ? "is-live" : ""}`}>
                {Array.from({ length: 18 }, (_, index) => (
                  <i key={index} style={{ "--bar": index } as React.CSSProperties} />
                ))}
              </div>

              <div className="record-controls">
                <span className="record-time">
                  00:{String(recorder.elapsedSeconds).padStart(2, "0")} / 00:30
                </span>
                <button
                  className={`mic-button ${recorder.isRecording ? "is-recording" : ""}`}
                  onClick={() =>
                    recorder.isRecording
                      ? void stopRecording()
                      : void beginRecording()
                  }
                  disabled={
                    processing ||
                    pendingUploads > 0 ||
                    session.status !== "active"
                  }
                  aria-label={recorder.isRecording ? "停止錄音" : "開始錄音"}
                >
                  {recorder.isRecording ? <Square size={24} /> : <Mic size={27} />}
                </button>
                <span className="attempt-label">
                  ATTEMPT {session.attemptNumber} / 3
                </span>
              </div>
            </div>

            {isDemoMode && session.status === "active" && (
              <div className="demo-tools">
                <button
                  className="demo-tools__toggle"
                  onClick={() => setSamplePanel((value) => !value)}
                >
                  <TestTube2 size={15} />
                  原型測試答案
                </button>
                {samplePanel && (
                  <div className="demo-tools__samples">
                    <button onClick={() => void runSample("pass")}>通過答案</button>
                    <button onClick={() => void runSample("short")}>太短答案</button>
                    <button onClick={() => void runSample("off-topic")}>離題答案</button>
                    {session.group === "agent2" && (
                      <button onClick={() => void runSample("flat")}>平淡語氣</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <aside className="diary-sidebar">
          <div className="diary-sidebar__head">
            <BookOpen size={19} />
            <div>
              <span className="section-kicker">LIVE WORKSHEET</span>
              <strong>My Adventure Diary</strong>
            </div>
          </div>
          <div className="diary-page-list">
            {worksheet.map((entry) => (
              <article
                key={entry.nodeId}
                className={entry.status !== "pending" ? "has-content" : ""}
              >
                <span>{entry.nodeId}</span>
                <div>
                  <small>{getNode(entry.nodeId).title}</small>
                  <strong>
                    {entry.status === "pending"
                      ? "Waiting for your voice"
                      : entry.status === "assisted"
                        ? "Needs more practice"
                        : entry.emotionWord}
                  </strong>
                </div>
                {entry.status === "confirmed" && <CheckCircle2 size={17} />}
              </article>
            ))}
          </div>
          <div className="diary-sidebar__footer">
            <Radio size={16} />
            <span>Live progress saves after every turn</span>
          </div>
          {isDemoMode && (
            <button className="reset-link" onClick={restartDemo}>
              <RotateCcw size={14} />
              重新開始示範
            </button>
          )}
        </aside>
      </div>

      {currentDiary && (
        <DiaryPanel
          entry={currentDiary}
          onConfirm={() => void confirmDiary()}
          onRetry={() => void retryDiary()}
          busy={processing}
        />
      )}
    </main>
  );
}
