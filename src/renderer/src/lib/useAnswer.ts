// One streamed AI answer: asks, streams, measures timing and splits out "Question type" / "Confidence".
// Shared by AI Interview and the Live Assistant.
//
// Every answer is locked to its own question: the request id is created here, BEFORE asking, and stored
// with the question. Streamed text is shown only if its id matches the question on screen, so an answer
// to an earlier question can never appear under a newer one.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnswerMode, StreamEvent, StreamStage } from "@shared/types";
import { parseAnswer } from "@shared/answerMeta";

export type AnswerStatus = "idle" | "thinking" | "streaming" | "error";

export interface AnswerState {
  requestId: string;
  question: string;
  raw: string;
  mode: AnswerMode;
  firstWordsMs: number | null;
  totalMs: number | null;
}

/** What to show while waiting for the first words. */
export function stageText(stage: StreamStage | null): string {
  switch (stage) {
    case "connected":
      return "The AI is preparing the answer…";
    case "thinking":
      return "The AI is thinking…";
    case "retrying":
      return "Free-plan limit reached: waiting a few seconds, then trying again…";
    default:
      return "Sending the question to the AI…";
  }
}

const QUIET_LIMIT_MS = 25_000; // give up only after this long with no sign of life at all

export function useAnswer(options: {
  getSessionId: () => string | undefined;
  onSessionId?: (id: string) => void;
  /** Called once when an answer finishes (not when it is stopped, replaced or fails). */
  onComplete?: (a: { question: string; raw: string; regenerated: boolean }) => void;
}) {
  const [current, setCurrent] = useState<AnswerState | null>(null);
  const [status, setStatus] = useState<AnswerStatus>("idle");
  const [stage, setStage] = useState<StreamStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The one request whose text may be shown. Everything else is ignored.
  const active = useRef<{ id: string; question: string; raw: string; startedAt: number; lastSign: number; stage: StreamStage | null; regenerated: boolean; gotFirst: boolean } | null>(null);
  // Events for a request id we don't know yet (kept for a moment, in case it turns out to be ours).
  const strays = useRef<{ e: StreamEvent; at: number }[]>([]);
  const opts = useRef(options);
  opts.current = options;

  const apply = useCallback((e: StreamEvent) => {
    const a = active.current;
    if (!a || e.requestId !== a.id) return false;
    a.lastSign = performance.now();
    if (e.type === "status") {
      a.stage = e.stage;
      setStage(e.stage);
    } else if (e.type === "delta") {
      a.raw += e.text;
      const first = a.gotFirst ? null : Math.round(performance.now() - a.startedAt);
      a.gotFirst = true;
      const raw = a.raw;
      setCurrent((c) => (c && c.requestId === a.id ? { ...c, raw, firstWordsMs: c.firstWordsMs ?? first } : c));
      setStatus("streaming");
    } else if (e.type === "done") {
      active.current = null;
      const total = Math.round(performance.now() - a.startedAt);
      setCurrent((c) => (c && c.requestId === a.id ? { ...c, totalMs: total } : c));
      setStatus("idle");
      if (a.raw.trim()) opts.current.onComplete?.({ question: a.question, raw: a.raw, regenerated: a.regenerated });
    } else {
      active.current = null;
      setError(e.error);
      setStatus("error");
    }
    return true;
  }, []);

  useEffect(
    () =>
      window.hiremate.ai.onStream((e) => {
        if (apply(e)) return;
        const now = performance.now();
        strays.current = [...strays.current.filter((s) => now - s.at < 5_000), { e, at: now }].slice(-400);
      }),
    [apply],
  );

  const ask = useCallback(async (question: string, mode: AnswerMode, regenerate = false) => {
    const q = question.trim();
    if (q.length < 3) return false;
    const previous = active.current;
    let id: string = crypto.randomUUID();
    const now = performance.now();
    active.current = { id, question: q, raw: "", startedAt: now, lastSign: now, stage: null, regenerated: regenerate, gotFirst: false };
    if (previous) void window.hiremate.ai.cancel(previous.id); // the new question replaces the old answer (no waiting)
    setError(null);
    setStage(null);
    setCurrent({ requestId: id, question: q, raw: "", mode, firstWordsMs: null, totalMs: null });
    setStatus("thinking");

    // Watchdog: give up only when nothing at all has happened for 25 s (no progress, no words).
    const mine = id;
    const timer = window.setInterval(() => {
      const a = active.current;
      if (!a || a.question !== q || (a.id !== mine && a.id !== id)) return window.clearInterval(timer);
      if (a.gotFirst) return window.clearInterval(timer);
      if (performance.now() - a.lastSign < QUIET_LIMIT_MS && performance.now() - a.startedAt < 60_000) return; // never wait more than a minute
      window.clearInterval(timer);
      active.current = null;
      void window.hiremate.ai.cancel(a.id);
      const where =
        a.stage === "thinking" ? "the AI was still thinking"
        : a.stage === "connected" ? "the AI accepted the question but sent no text"
        : a.stage === "retrying" ? "it was waiting for the free-plan limit"
        : a.stage === "sent" ? "the AI didn't reply"
        : "the app got no progress at all — restart HireMate (Ctrl + C, then npm run dev)";
      setError(`No answer within 25 seconds: ${where}. Press Regenerate, or try another model in Settings.`);
      setStatus("error");
    }, 1_000);

    const r = await window.hiremate.interview.ask(q, mode, opts.current.getSessionId(), regenerate, id);
    if (active.current?.id !== id) {
      // A newer question arrived while this one was starting: make sure this one stops.
      if (r.ok) void window.hiremate.ai.cancel(r.data.requestId);
      return false;
    }
    if (!r.ok) {
      active.current = null;
      setError(r.error);
      setStatus("error");
      return false;
    }
    if (r.data.requestId !== id) {
      // The app's main part chose its own id (older files): follow that id instead, including anything already sent.
      id = r.data.requestId;
      active.current.id = id;
      setCurrent((c) => (c ? { ...c, requestId: id } : c));
      const mineNow = strays.current.filter((s) => s.e.requestId === id);
      strays.current = strays.current.filter((s) => s.e.requestId !== id);
      for (const s of mineNow) apply(s.e);
    }
    opts.current.onSessionId?.(r.data.sessionId);
    return true;
  }, [apply]);

  const cancel = useCallback(async () => {
    const a = active.current;
    if (a) await window.hiremate.ai.cancel(a.id);
  }, []);

  const reset = useCallback(() => {
    const a = active.current;
    active.current = null;
    if (a) void window.hiremate.ai.cancel(a.id);
    setCurrent(null);
    setError(null);
    setStage(null);
    setStatus("idle");
  }, []);

  const parsed = useMemo(() => parseAnswer(current?.raw ?? ""), [current?.raw]);
  const busy = status === "thinking" || status === "streaming";

  return { current, parsed, status, stage, busy, error, ask, cancel, reset };
}

export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
