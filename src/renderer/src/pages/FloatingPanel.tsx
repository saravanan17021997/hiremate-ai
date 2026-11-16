// The compact floating panel. It only mirrors the Live Assistant window: it can't start listening,
// and it closes when the live session ends. It's an ordinary window, so it shows in screen sharing.
import { AlertTriangle, Ear, Loader2, MicOff, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { PanelAction, PanelState } from "@shared/types";
import { Markdown } from "../components/Markdown";
import { AnswerMeta, CopyButton, RegenerateButton, VerifyWarning } from "../components/AnswerParts";

const STATUS: Record<PanelState["status"], { label: string; dot: string }> = {
  idle: { label: "Not listening", dot: "bg-dim" },
  listening: { label: "Listening", dot: "bg-emerald-400 animate-pulse" },
  transcribing: { label: "Transcribing", dot: "bg-sky-300 animate-pulse" },
  thinking: { label: "Thinking", dot: "bg-electric animate-pulse" },
  answering: { label: "Answering", dot: "bg-violet animate-pulse" },
};

export function FloatingPanel() {
  const [state, setState] = useState<PanelState | null>(null);

  useEffect(() => {
    document.title = "HireMate AI – Assistant panel";
    void window.hiremate.panel.getState().then((r) => r.ok && r.data && setState(r.data));
    return window.hiremate.panel.onState(setState);
  }, []);

  const act = (a: PanelAction) => void window.hiremate.panel.act(a);

  if (!state) {
    return (
      <div className="app-backdrop flex h-full items-center justify-center p-6 text-center text-sm text-haze">
        Waiting for the Live Assistant… Start a live session in the main window.
      </div>
    );
  }

  const busy = state.status === "thinking" || state.status === "answering";
  const s = STATUS[state.status];

  return (
    <div className="app-backdrop flex h-full flex-col">
      {/* Disclosure: always on screen */}
      <div role="status" className="flex items-center gap-2 border-b border-violet/30 bg-violet/15 px-4 py-2 text-xs text-violet-soft">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>{state.disclosure}</span>
      </div>

      <div className="flex items-center gap-2 px-4 pt-3 text-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden />
        <span className="font-medium text-mist">{s.label}</span>
        {state.status === "idle" && <MicOff className="h-3.5 w-3.5 text-dim" />}
        {state.status === "listening" && <Ear className="h-3.5 w-3.5 text-emerald-300" />}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {state.notice && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {state.notice}
          </p>
        )}
        <div>
          <p className="text-xs text-dim">Current question</p>
          <p className="mt-1 text-[15px] font-semibold text-mist" data-selectable>{state.question || "No question yet."}</p>
        </div>
        {state.question && (
          <div>
            <p className="mb-1 text-xs text-dim">Suggested answer</p>
            {busy && !state.answer ? (
              <p className="flex items-center gap-2 text-sm text-electric-soft"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</p>
            ) : (
              <div className="text-sm"><Markdown text={state.answer} streaming={state.status === "answering"} /></div>
            )}
          </div>
        )}
        {state.question && <AnswerMeta questionType={state.questionType} confidence={state.confidence} firstWordsMs={state.firstWordsMs} totalMs={state.totalMs} />}
        {!busy && <VerifyWarning confidence={state.confidence} />}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-white/[0.06] px-3 py-2">
        <CopyButton text={state.answer} />
        {(["short", "medium", "detailed"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={busy}
            aria-pressed={state.mode === m}
            onClick={() => act(m)}
            className={`rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-40 ${state.mode === m ? "bg-white/[0.09] text-mist" : "text-haze hover:bg-white/[0.05] hover:text-mist"}`}
          >
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
        <RegenerateButton disabled={busy || !state.question} onClick={() => act("regenerate")} />
      </div>
    </div>
  );
}
