// Pieces shared by every answer view: length picker, question-type / confidence / timing chips,
// the "please verify" warning and the Copy / Regenerate buttons.
import { AlertTriangle, Check, Copy, Gauge, RefreshCw, Timer } from "lucide-react";
import { useState } from "react";
import type { AnswerMode } from "@shared/types";
import type { Confidence } from "@shared/answerMeta";

export const MODES: { id: AnswerMode; label: string; hint: string }[] = [
  { id: "short", label: "Short", hint: "2–3 sentences" },
  { id: "medium", label: "Medium", hint: "30–60 seconds" },
  { id: "detailed", label: "Detailed", hint: "1–2 minutes" },
];

export function LengthPicker({ mode, onChange, disabled, compact }: { mode: AnswerMode; onChange: (m: AnswerMode) => void; disabled?: boolean; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Answer length" className="inline-flex rounded-xl bg-white/[0.04] p-1 text-sm">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={mode === m.id}
          disabled={disabled}
          title={m.hint}
          onClick={() => onChange(m.id)}
          className={`rounded-lg px-3 py-1.5 disabled:opacity-40 ${mode === m.id ? "bg-white/[0.09] text-mist" : "text-haze hover:text-mist"}`}
        >
          {m.label}
          {!compact && <span className="ml-1.5 hidden text-xs text-dim lg:inline">{m.hint}</span>}
        </button>
      ))}
    </div>
  );
}

const CONF_STYLE: Record<Confidence, string> = {
  High: "border-emerald-400/30 text-emerald-300",
  Medium: "border-amber-400/30 text-amber-200",
  Low: "border-rose-400/40 text-rose-300",
};

export function AnswerMeta({ questionType, confidence, firstWordsMs, totalMs }: { questionType: string | null; confidence: Confidence | null; firstWordsMs: number | null; totalMs: number | null }) {
  if (!questionType && !confidence && firstWordsMs === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {questionType && <span className="rounded-full border border-white/10 px-2.5 py-1 text-haze">{questionType} question</span>}
      {confidence && (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${CONF_STYLE[confidence]}`}>
          <Gauge className="h-3.5 w-3.5" /> {confidence} confidence
        </span>
      )}
      {firstWordsMs !== null && (
        <span className="inline-flex items-center gap-1 text-dim">
          <Timer className="h-3.5 w-3.5" /> First words in {(firstWordsMs / 1000).toFixed(1)} s{totalMs !== null && ` · complete in ${(totalMs / 1000).toFixed(1)} s`}
        </span>
      )}
    </div>
  );
}

export function VerifyWarning({ confidence }: { confidence: Confidence | null }) {
  if (confidence !== "Low") return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> I'm not confident about this answer. Please verify before responding.
    </p>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    try {
      const win = e.currentTarget.ownerDocument.defaultView ?? window; // the web floating panel is a separate window
      await win.navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1600);
  };
  return (
    <button type="button" disabled={!text} onClick={(e) => void copy(e)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-haze hover:bg-white/[0.05] hover:text-mist disabled:opacity-40">
      {state === "copied" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : label}
    </button>
  );
}

export function RegenerateButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-haze hover:bg-white/[0.05] hover:text-mist disabled:opacity-40">
      <RefreshCw className="h-4 w-4" /> Regenerate
    </button>
  );
}
