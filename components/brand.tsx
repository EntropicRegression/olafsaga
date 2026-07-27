import { Snowflake, SunMedium } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <div className="brand__mark" aria-hidden="true">
        <SunMedium className="brand__sun" size={compact ? 22 : 28} />
        <Snowflake className="brand__snow" size={compact ? 20 : 24} />
      </div>
      <div>
        <span className="brand__eyebrow">SPOKEN ENGLISH LAB</span>
        <strong className="brand__name">Adventure Diary</strong>
      </div>
    </div>
  );
}
