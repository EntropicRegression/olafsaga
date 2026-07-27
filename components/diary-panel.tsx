import { BookCheck, Check, RotateCcw } from "lucide-react";
import { getNode } from "@/lib/study/config";
import type { NodeId, WorksheetEntry } from "@/lib/study/types";

export function DiaryPanel({
  entry,
  onConfirm,
  onRetry,
  busy,
}: {
  entry: WorksheetEntry;
  onConfirm: () => void;
  onRetry: () => void;
  busy: boolean;
}) {
  const node = getNode(entry.nodeId as NodeId);
  const assisted = entry.status === "assisted";
  return (
    <div className="diary-overlay" role="dialog" aria-modal="true">
      <section className="diary-card">
        <div className="diary-card__top">
          <div className="diary-icon">
            <BookCheck size={24} />
          </div>
          <div>
            <span className="section-kicker">ADVENTURE DIARY · PAGE {entry.nodeId}</span>
            <h2>{assisted ? "這一頁先標記為需要練習" : "你的日記頁準備好了！"}</h2>
          </div>
        </div>
        {assisted ? (
          <div className="assisted-note">
            <strong>輔助前進／未達標</strong>
            <p>系統沒有替你填入答案，研究者可在後台看到這次學習歷程。</p>
          </div>
        ) : (
          <div className="diary-fields">
            <div>
              <span>STORY MEMORY</span>
              <p>{entry.storySummary || node.storySummary}</p>
            </div>
            <div>
              <span>FEELING WORD</span>
              <p className="emotion-word">{entry.emotionWord || node.targetEmotion}</p>
            </div>
          </div>
        )}
        <div className="diary-card__actions">
          <button className="secondary-button" onClick={onRetry} disabled={busy}>
            <RotateCcw size={17} />
            重新錄音
          </button>
          <button className="primary-button" onClick={onConfirm} disabled={busy}>
            <Check size={18} />
            {entry.nodeId === 5 ? "完成日記" : "確認這一頁"}
          </button>
        </div>
      </section>
    </div>
  );
}
