import { Volume2 } from "lucide-react";
import type { ChatMessage } from "@/lib/study/types";

function formattedText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

export function ChatBubble({ message }: { message: ChatMessage }) {
  const isStudent = message.role === "student";
  return (
    <div
      className={`chat-row ${isStudent ? "chat-row--student" : "chat-row--olaf"}`}
    >
      {!isStudent && (
        <div className="speaker-badge" aria-label="Olaf">
          O
        </div>
      )}
      <div>
        <div className="chat-meta">
          <span>{isStudent ? "ANNA · YOU" : "OLAF · DIARY GUIDE"}</span>
          {message.toneHint && (
            <span className="tone-chip">
              <Volume2 size={12} />
              {message.toneHint}
            </span>
          )}
        </div>
        <div className="chat-bubble">{formattedText(message.text)}</div>
      </div>
    </div>
  );
}
