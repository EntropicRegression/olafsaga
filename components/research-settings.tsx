"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CloudCog,
  FileUp,
  History,
  LoaderCircle,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import { STUDY_CONFIG_VERSION, STUDY_THRESHOLDS, VOCABULARY_VERSION } from "@/lib/study/config";
import type { StudyThresholds } from "@/lib/study/types";

interface ActiveStudyConfig {
  configVersion: string;
  vocabularyVersion: string;
  thresholds: StudyThresholds;
  updatedAt: string | null;
  updatedBy: string | null;
  changeNote: string | null;
}

const fields: Array<{
  key: keyof StudyThresholds;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
}> = [
  { key: "minimumWordCount", label: "最低英文詞數", hint: "低於此值判定為 TOO_SHORT", min: 1, max: 50, step: 1, suffix: "words" },
  { key: "accuracy", label: "Accuracy 門檻", hint: "Azure 發音準確度最低分", min: 0, max: 100, step: 1, suffix: "/ 100" },
  { key: "fluency", label: "Fluency 門檻", hint: "Azure 口語流暢度最低分", min: 0, max: 100, step: 1, suffix: "/ 100" },
  { key: "emotionMinimumScore", label: "情緒信心值", hint: "emotion2vec 目標情緒最低信心", min: 0, max: 1, step: 0.05, suffix: "score" },
  { key: "emotionMaximumRank", label: "目標情緒排名", hint: "目標情緒必須位於此排名內", min: 1, max: 10, step: 1, suffix: "rank" },
  { key: "maximumAttempts", label: "有效嘗試上限", hint: "達上限後保留紀錄並繼續流程", min: 1, max: 10, step: 1, suffix: "tries" },
  { key: "maximumRecordingSeconds", label: "錄音時間上限", hint: "學生端會自動停止並由 API 驗證", min: 5, max: 120, step: 1, suffix: "seconds" },
];

interface ResearchSettingsProps {
  demo: boolean;
  onNotice: (message: string) => void;
  onImportVocabulary: (file: File) => Promise<void>;
}

export function ResearchSettings({
  demo,
  onNotice,
  onImportVocabulary,
}: ResearchSettingsProps) {
  const vocabularyInput = useRef<HTMLInputElement | null>(null);
  const fallback: ActiveStudyConfig = useMemo(() => ({
    configVersion: STUDY_CONFIG_VERSION,
    vocabularyVersion: VOCABULARY_VERSION,
    thresholds: STUDY_THRESHOLDS,
    updatedAt: null,
    updatedBy: null,
    changeNote: null,
  }), []);
  const [active, setActive] = useState<ActiveStudyConfig>(fallback);
  const [draft, setDraft] = useState<StudyThresholds>(fallback.thresholds);
  const [changeNote, setChangeNote] = useState("");
  const [loading, setLoading] = useState(!demo);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () => fields.some(({ key }) => draft[key] !== active.thresholds[key]),
    [active.thresholds, draft],
  );

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    void apiFetch<ActiveStudyConfig>("/api/admin/config/study")
      .then((payload) => {
        if (cancelled) return;
        setActive(payload);
        setDraft(payload.thresholds);
      })
      .catch((error) => {
        if (!cancelled) onNotice(error instanceof Error ? error.message : "無法讀取研究設定。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [demo, onNotice]);

  async function save() {
    if (demo) {
      onNotice("訪客預覽模式不會發布研究設定。");
      return;
    }
    if (!dirty) {
      onNotice("門檻值尚未變更。");
      return;
    }
    if (changeNote.trim().length < 5) {
      onNotice("請輸入至少 5 個字的變更原因，供研究稽核使用。");
      return;
    }
    setSaving(true);
    try {
      const payload = await apiFetch<{
        configVersion: string;
        thresholds: StudyThresholds;
        changeNote: string;
        createdAt: string;
      }>("/api/admin/config/study", {
        method: "POST",
        body: JSON.stringify({ thresholds: draft, changeNote }),
      });
      const next = {
        ...active,
        configVersion: payload.configVersion,
        thresholds: payload.thresholds,
        updatedAt: payload.createdAt,
        changeNote: payload.changeNote,
      };
      setActive(next);
      setDraft(next.thresholds);
      setChangeNote("");
      onNotice(`研究設定 ${payload.configVersion} 已發布；只套用至新場次。`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "研究設定發布失敗。");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="admin-card settings-loading">
        <LoaderCircle className="spin" size={22} />
        正在讀取目前研究設定…
      </section>
    );
  }

  return (
    <section className="settings-workspace">
      <article className="admin-card settings-editor">
        <div className="settings-editor__head">
          <div className="management-card-heading">
            <div className="management-card-heading__icon"><Settings2 size={20} /></div>
            <div>
              <span>DECISION POLICY</span>
              <h2>判定門檻</h2>
              <p>修改後發布不可變的新版本，既有研究場次不受影響。</p>
            </div>
          </div>
          <div className="version-pill">
            <History size={14} />
            <span>目前版本</span>
            <strong>{active.configVersion}</strong>
          </div>
        </div>

        <div className="threshold-grid">
          {fields.map((field) => (
            <label className="threshold-field" key={field.key}>
              <span>{field.label}</span>
              <small>{field.hint}</small>
              <div>
                <input
                  type="number"
                  value={draft[field.key]}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    [field.key]: Number(event.target.value),
                  }))}
                />
                <b>{field.suffix}</b>
              </div>
            </label>
          ))}
        </div>

        <div className="settings-publish">
          <label>
            <span>變更原因</span>
            <textarea
              value={changeNote}
              onChange={(event) => setChangeNote(event.target.value)}
              placeholder="例如：依前測結果調整口語流暢度門檻"
              maxLength={300}
            />
            <small>{changeNote.length} / 300</small>
          </label>
          <div className="settings-publish__actions">
            <button
              className="secondary-button"
              type="button"
              disabled={!dirty || saving}
              onClick={() => setDraft(active.thresholds)}
            >
              <RotateCcw size={16} />
              還原
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
              發布新版本
            </button>
          </div>
        </div>
      </article>

      <aside className="settings-side">
        <article className="admin-card settings-impact-card">
          <div className="management-card-heading">
            <div className="management-card-heading__icon"><ShieldCheck size={20} /></div>
            <div>
              <span>VERSION SAFETY</span>
              <h2>版本套用規則</h2>
            </div>
          </div>
          <ul>
            <li><CheckCircle2 size={16} />新場次鎖定最新設定版本</li>
            <li><CheckCircle2 size={16} />既有場次沿用原門檻</li>
            <li><CheckCircle2 size={16} />所有發布動作寫入稽核紀錄</li>
            <li><CheckCircle2 size={16} />錄音上限同時由學生端與 API 驗證</li>
          </ul>
          {active.changeNote && <p>最近變更：{active.changeNote}</p>}
        </article>

        <article className="admin-card vocabulary-card">
          <div className="management-card-heading">
            <div className="management-card-heading__icon"><FileUp size={20} /></div>
            <div>
              <span>VOCABULARY</span>
              <h2>英文詞表</h2>
              <p>目前版本：{active.vocabularyVersion}</p>
            </div>
          </div>
          <input
            ref={vocabularyInput}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onImportVocabulary(file);
              event.currentTarget.value = "";
            }}
          />
          <button className="secondary-button" onClick={() => vocabularyInput.current?.click()}>
            <FileUp size={16} />
            匯入並發布新詞表
          </button>
          <small>接受 100–5,000 個有效英文詞；發布後不覆寫舊版本。</small>
        </article>

        <article className="admin-card service-card">
          <div className="management-card-heading">
            <div className="management-card-heading__icon"><CloudCog size={20} /></div>
            <div><span>SERVICES</span><h2>必要服務</h2></div>
          </div>
          {[
            ["Application", demo ? "Demo mode" : "Vercel"],
            ["Structured data", demo ? "Browser" : "Firestore"],
            ["Speech", demo ? "Browser fallback" : "Azure Speech"],
            ["Semantic model", "gpt-5-mini"],
            ["Emotion model", "emotion2vec+ base"],
          ].map(([label, value]) => (
            <div key={label}><span>{label}</span><strong>{value}</strong></div>
          ))}
        </article>
      </aside>
    </section>
  );
}
