"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  LockKeyhole,
  Mic2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Brand } from "./brand";
import {
  isFirebaseConfigured,
  signInParticipant,
} from "@/lib/firebase/client";

const isDemoMode =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !isFirebaseConfigured;

export function LoginPortal() {
  const router = useRouter();
  const [role, setRole] = useState<"student" | "researcher">("student");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function enter(
    event?: React.FormEvent,
    quickCode?: string,
  ): Promise<void> {
    event?.preventDefault();
    const selectedCode = (quickCode ?? code).trim().toUpperCase();
    if (!selectedCode) {
      setError("請輸入研究代碼。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!isDemoMode) {
        await signInParticipant(selectedCode, password);
      }
      sessionStorage.setItem("olaf-participant-code", selectedCode);
      sessionStorage.setItem("olaf-role", role);
      router.push(role === "researcher" ? "/admin" : "/student");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "登入失敗，請稍後再試。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="landing-shell">
      <section className="landing-story">
        <Brand />
        <div className="landing-copy">
          <div className="status-pill">
            <Sparkles size={15} />
            Voice-first research prototype
          </div>
          <h1>
            Remember the story.
            <span>Hear your English grow.</span>
          </h1>
          <p>
            用聲音完成五段冒險日記。系統會保存每次錄音、逐字稿與學習歷程，
            不需要在聊天室打字。
          </p>
        </div>
        <div className="feature-row" aria-label="主要功能">
          <article>
            <Mic2 size={20} />
            <span>即時語音逐字稿</span>
          </article>
          <article>
            <BookOpen size={20} />
            <span>五節點冒險日記</span>
          </article>
          <article>
            <ShieldCheck size={20} />
            <span>研究資料分層保護</span>
          </article>
        </div>
        <p className="landing-note">
          Prototype 01 · Designed for iPad · No character artwork
        </p>
      </section>

      <section className="login-column">
        <div className="login-card">
          <div className="role-switch" aria-label="登入身分">
            <button
              type="button"
              className={role === "student" ? "is-active" : ""}
              onClick={() => setRole("student")}
            >
              <BookOpen size={16} />
              學生
            </button>
            <button
              type="button"
              className={role === "researcher" ? "is-active" : ""}
              onClick={() => setRole("researcher")}
            >
              <BarChart3 size={16} />
              研究者
            </button>
          </div>

          <div className="login-card__heading">
            <span className="section-kicker">
              {role === "student" ? "STUDENT ENTRY" : "RESEARCH CONSOLE"}
            </span>
            <h2>{role === "student" ? "準備好回憶冒險了嗎？" : "研究資料控制台"}</h2>
            <p>
              {role === "student"
                ? "使用研究者提供的受試者代碼與密碼登入。"
                : "查看歷程、評量分數與匯出研究資料。"}
            </p>
          </div>

          <form onSubmit={(event) => void enter(event)} className="login-form">
            <label>
              研究代碼
              <div className="input-wrap">
                <LockKeyhole size={18} />
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={role === "student" ? "例如 ANNA-021" : "RESEARCHER-01"}
                  autoComplete="username"
                  spellCheck={false}
                />
              </div>
            </label>
            {!isDemoMode && (
              <label>
                密碼
                <div className="input-wrap">
                  <LockKeyhole size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              </label>
            )}
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button" disabled={busy}>
              {busy ? "正在登入…" : "進入系統"}
              <ArrowRight size={18} />
            </button>
          </form>

          {isDemoMode && (
            <div className="demo-entry">
              <div>
                <span>DEMO MODE</span>
                <p>無需雲端帳號，資料只保存在這台瀏覽器。</p>
              </div>
              <div className="demo-entry__actions">
                {role === "student" ? (
                  <>
                    <button type="button" onClick={() => void enter(undefined, "ANNA-021")}>
                      語言鷹架組
                    </button>
                    <button type="button" onClick={() => void enter(undefined, "ANNA-022")}>
                      情緒鷹架組
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void enter(undefined, "RESEARCHER-DEMO")}
                  >
                    開啟示範後台
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="privacy-line">
          <ShieldCheck size={16} />
          錄音只供研究使用，學生端不顯示實驗組別。
        </div>
      </section>
    </main>
  );
}
