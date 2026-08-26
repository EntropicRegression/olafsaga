"use client";

import { useState } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { apiFetch } from "@/lib/client/api";

function localDateTimeValue() {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const random = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
  return `O${random.slice(0, 10)}7!`;
}

interface ParticipantCreatorProps {
  demo: boolean;
  onCreated: () => Promise<void>;
  onNotice: (message: string) => void;
}

export function ParticipantCreator({
  demo,
  onCreated,
  onNotice,
}: ParticipantCreatorProps) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [classId, setClassId] = useState("");
  const [consentVersion, setConsentVersion] = useState("consent-2026-v1");
  const [consentedAt, setConsentedAt] = useState(localDateTimeValue);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) {
      onNotice("訪客預覽模式不會建立正式學生帳號。");
      return;
    }
    setSubmitting(true);
    try {
      const participant = await apiFetch<{ code: string }>(
        "/api/admin/participants",
        {
          method: "POST",
          body: JSON.stringify({
            code,
            password,
            classId,
            consentVersion,
            consentedAt: new Date(consentedAt).toISOString(),
          }),
        },
      );
      onNotice(`學生帳號 ${participant.code} 已建立，可立即登入。`);
      setCode("");
      setPassword("");
      await onCreated();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "學生帳號建立失敗。");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPassword() {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    onNotice("初始密碼已複製；請透過安全管道交付給學生。");
  }

  return (
    <article className="admin-card participant-create-card">
      <div className="management-card-heading">
        <div className="management-card-heading__icon">
          <UserPlus size={20} />
        </div>
        <div>
          <span>QUICK CREATE</span>
          <h2>建立學生帳號</h2>
          <p>建立單一帳號，不會覆寫既有受試者資料。</p>
        </div>
      </div>

      <form className="participant-form" onSubmit={submit}>
        <label>
          <span>學生代碼</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="例如 STUDENT-001"
            pattern="[A-Za-z0-9][A-Za-z0-9-]{2,39}"
            required
          />
          <small>3–40 字元，可使用英文字母、數字及連字號。</small>
        </label>

        <label>
          <span>初始密碼</span>
          <div className="input-with-actions">
            <KeyRound size={16} />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              placeholder="至少 8 字元，含英文字母與數字"
              minLength={8}
              required
            />
            <button
              type="button"
              title={showPassword ? "隱藏密碼" : "顯示密碼"}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button type="button" title="複製密碼" onClick={() => void copyPassword()}>
              <Copy size={16} />
            </button>
          </div>
          <button
            className="text-action"
            type="button"
            onClick={() => {
              setPassword(generatePassword());
              setShowPassword(true);
            }}
          >
            <RefreshCw size={14} />
            產生安全密碼
          </button>
        </label>

        <div className="participant-form__row">
          <label>
            <span>班級代碼</span>
            <input
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              placeholder="例如 CLASS-A"
              maxLength={80}
              required
            />
          </label>
          <label>
            <span>同意書版本</span>
            <input
              value={consentVersion}
              onChange={(event) => setConsentVersion(event.target.value)}
              maxLength={80}
              required
            />
          </label>
        </div>

        <label>
          <span>取得研究同意時間</span>
          <input
            type="datetime-local"
            value={consentedAt}
            onChange={(event) => setConsentedAt(event.target.value)}
            required
          />
        </label>

        <div className="participant-form__footer">
          <p>分組會在學生首次開始場次時由伺服器鎖定。</p>
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? <LoaderCircle className="spin" size={17} /> : <UserPlus size={17} />}
            建立帳號
          </button>
        </div>
      </form>
    </article>
  );
}
