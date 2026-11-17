// Live Assistant: suggested replies to questions asked in a work meeting, or in an interview
// where the employer has ALLOWED AI assistance. Everyone must know an AI assistant is transcribing:
// the app shows a disclosure line for the chat and keeps an "AI assistant in use" notice visible.
// Audio is captured only while you are listening.
import { AlertTriangle, Check, Copy, Ear, Loader2, Mic, MicOff, PanelTopOpen, Pin, PinOff, ShieldCheck, Square, Stethoscope, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { AnswerMode, LivePurpose } from "@shared/types";
import { PageHeader } from "../components/PageHeader";
import { Markdown } from "../components/Markdown";
import { useIpc } from "../lib/useIpc";
import { PAUSE_CHOICES, SpeechSegmenter, type PauseChoice } from "../lib/segmenter";
import { isLikelyQuestion, pendingQuestion, type HeardLine } from "../lib/questions";
import { stageText, useAnswer } from "../lib/useAnswer";
import { parseAnswer } from "@shared/answerMeta";
import { APP_NAME } from "@shared/brand";
import { AnswerMeta, CopyButton, LengthPicker, RegenerateButton, VerifyWarning } from "../components/AnswerParts";

type Status = "idle" | "listening" | "transcribing" | "thinking" | "answering";
type Line = { id: number; text: string; question: boolean; unclear: boolean };
type LiveInfo = { id: string; purpose: LivePurpose; organisation: string; permission: string };

const disclosure = (purpose: LivePurpose, name: string) =>
  purpose === "meeting"
    ? `FYI: I'm using ${APP_NAME}, an AI assistant that transcribes this meeting to help me answer questions.`
    : `I'm using ${APP_NAME}, an AI interview assistant, during this interview as agreed with ${name || "your team"}.`;
const input = "w-full rounded-xl border border-white/10 bg-navy-800 px-3 py-2.5 text-sm text-mist outline-none focus:border-electric/50";

export function LiveAssistant() {
  const [session, setSession] = useState<LiveInfo | null>(null);
  return session ? <LiveSession session={session} onEnd={() => setSession(null)} /> : <ConsentStep onStarted={setSession} />;
}

/* ---------- Step 1: purpose and consent ---------- */

function ConsentStep({ onStarted }: { onStarted: (s: LiveInfo) => void }) {
  const getCtx = useCallback(() => window.hiremate.interview.context(), []);
  const { data: ctx } = useIpc(getCtx);
  const [purpose, setPurpose] = useState<LivePurpose>("meeting");
  const [organisation, setOrganisation] = useState("");
  const [permission, setPermission] = useState("");
  const [notes, setNotes] = useState("");
  const [informed, setInformed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meeting = purpose === "meeting";
  const permissionText = meeting ? "All participants informed in the meeting chat" : permission;

  const start = async () => {
    setBusy(true);
    setError(null);
    const r = await window.hiremate.live.start({ purpose, organisation, permission: permissionText, notes: meeting ? notes : undefined, othersInformed: true });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onStarted({ id: r.data.sessionId, purpose, organisation: organisation.trim(), permission: permissionText.trim() });
  };

  const missing =
    organisation.trim().length < 2 ? (meeting ? "Add the meeting name." : "Add the company that allowed AI assistance.")
    : permissionText.trim().length < 5 ? "Say how the company allowed it."
    : !informed ? (meeting ? "Confirm that everyone in the meeting knows." : "Confirm that the interviewer has agreed.")
    : null;
  const ready = missing === null;

  return (
    <>
      <PageHeader title="Live Assistant" subtitle="Listens to the meeting audio and suggests replies to questions people ask you, using your profile, projects and notes." />
      <section className="glass max-w-3xl rounded-3xl p-7">
        <div role="radiogroup" aria-label="Session type" className="inline-flex rounded-xl bg-white/[0.04] p-1 text-sm">
          {(["meeting", "interview"] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={purpose === p} onClick={() => { setPurpose(p); setInformed(false); }} className={`rounded-lg px-3 py-1.5 ${purpose === p ? "bg-white/[0.09] text-mist" : "text-haze hover:text-mist"}`}>
              {p === "meeting" ? "Work meeting" : "Interview (AI allowed)"}
            </button>
          ))}
        </div>

        <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); void start(); }}>
          <label className="block text-sm text-haze"><span className="mb-1.5 block">{meeting ? "Meeting name" : "Company that allowed AI assistance"}</span>
            <input className={input} required maxLength={200} value={organisation} onChange={(e) => { setOrganisation(e.target.value); if (!meeting) setInformed(false); }} placeholder={meeting ? "e.g. Weekly sales review" : "e.g. Acme Technologies"} />
          </label>
          {meeting ? (
            <label className="block text-sm text-haze"><span className="mb-1 block">Meeting notes (optional)</span>
              <span className="mb-1.5 block text-xs text-dim">Agenda, figures or facts the AI may use in replies. It won't invent anything beyond these and your profile.</span>
              <textarea className={`${input} min-h-24`} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Q3 target 1.2 Cr, achieved 1.05 Cr. Dell stock arriving 20 Nov." />
            </label>
          ) : (
            <label className="block text-sm text-haze"><span className="mb-1.5 block">How they allowed it</span>
              <input className={input} required maxLength={500} value={permission} onChange={(e) => { setPermission(e.target.value); setInformed(false); }} placeholder='e.g. "HR email from Priya, 4 Nov"' />
            </label>
          )}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-sm text-haze">Post this in the meeting chat when you start:</p>
            <DisclosureLine text={disclosure(purpose, organisation.trim())} />
          </div>
          <label className="flex items-start gap-3 text-sm text-mist">
            <input type="checkbox" checked={informed} onChange={(e) => setInformed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-500" />
            {meeting ? "Everyone in the meeting knows an AI assistant is transcribing it." : "The interviewer knows I'm using an AI assistant and has agreed to it."}
          </label>
          {ctx && !ctx.aiReady && <p className="text-sm text-amber-200">Connect an AI provider first in <Link to="/settings" className="underline">Settings</Link>.</p>}
          <ConsentState confirmed={ready} missing={missing} />
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
          <button type="submit" disabled={busy || !ready} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-electric to-violet px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Start Live Assistant
          </button>
          <p className="text-xs text-dim">
            {IS_WEB
              ? "When the browser asks, choose the Google Meet / Teams tab and turn on \"Also share tab audio\" (or choose Entire screen and turn on \"Also share system audio\"). Only the sound is used; the picture is never recorded."
              : "Needs a Groq (free) or OpenAI key for transcription. HireMate hears the sound your computer plays (the other people in the call), not your microphone. The screen picture is never recorded."}
          </p>
        </form>
      </section>
    </>
  );
}

/** The consent state is always shown, so it's never unclear whether AI assistance is switched on. */
function ConsentState({ confirmed, missing }: { confirmed: boolean; missing?: string | null }) {
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-3 text-sm ${confirmed ? "border-emerald-400/30 bg-emerald-400/[0.07]" : "border-white/10 bg-white/[0.02]"}`}>
      <span className="font-medium text-mist">AI Assistance</span>
      {confirmed ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Enabled — Consent confirmed</span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-haze"><span className="h-2 w-2 rounded-full border border-haze" /> Off — Consent not confirmed</span>
      )}
      {!confirmed && missing && <span className="w-full text-xs text-dim">{missing}</span>}
    </div>
  );
}

function DisclosureLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-start gap-3">
      <p className="flex-1 rounded-xl bg-navy-950/60 px-3 py-2 text-sm text-mist" data-selectable>{text}</p>
      <button type="button" onClick={() => void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-haze hover:bg-white/[0.05] hover:text-mist">
        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/* ---------- Step 2: live session ---------- */

const UNCLEAR = "Could not clearly understand the question.";
const CONTINUE_MS = 1_000; // speech this soon after a question is treated as the rest of it

function LiveSession({ session, onEnd }: { session: LiveInfo; onEnd: () => void }) {
  const meeting = session.purpose === "meeting";
  const [capture, setCapture] = useState<"idle" | "listening" | "transcribing">("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [earlier, setEarlier] = useState<{ question: string; answer: string; at: number }[]>([]);
  const [autoAnswer, setAutoAnswer] = useState(true);
  const [mode, setMode] = useState<AnswerMode>("short");
  const [onTop, setOnTop] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [source, setSource] = useState<AudioSource>(readSource);
  const [pause, setPause] = useState<PauseChoice>(readPause);
  const pauseMs = useRef(pauseToMs(pause));
  pauseMs.current = pauseToMs(pause);
  const [inputs, setInputs] = useState<{ id: string; label: string }[]>([]);
  const [outputName, setOutputName] = useState("");
  const [test, setTest] = useState<AudioTest | null>(null);
  const testRef = useRef<AudioTest | null>(null);
  const updateTest = useCallback((f: (t: AudioTest) => AudioTest) => {
    if (!testRef.current || testRef.current.done) return;
    testRef.current = f(testRef.current);
    setTest(testRef.current);
  }, []);
  const [silentFor, setSilentFor] = useState(0); // seconds with no sound reaching the app
  const lastSound = useRef(0);

  const audio = useRef<{ stop: () => void } | null>(null);
  const pending = useRef<HeardLine[]>([]);
  const lastAsked = useRef<{ question: string; endedAt: number } | null>(null);
  const settings = useRef({ autoAnswer, mode });
  settings.current = { autoAnswer, mode };
  const transcriptEnd = useRef<HTMLDivElement>(null);

  const answer = useAnswer({
    getSessionId: () => session.id,
    onComplete: ({ question, raw, regenerated }) =>
      setEarlier((h) => {
        const item = { question, answer: parseAnswer(raw).body, at: Date.now() };
        // Regenerate, or the rest of a question split by a short pause, replaces the previous entry.
        const replaces = h[0] && ((regenerated && h[0].question === question) || (question.length > h[0].question.length && question.startsWith(h[0].question)));
        return replaces ? [item, ...h.slice(1)] : [item, ...h];
      }),
  });
  const { current, parsed } = answer;
  const status: Status = answer.status === "thinking" ? "thinking" : answer.status === "streaming" ? "answering" : capture;
  const banner = meeting ? `AI assistant in use · ${session.organisation} (participants informed)` : `AI assistant in use · allowed by ${session.organisation}`;

  // Braces matter: newer Chrome returns a Promise from scrollIntoView, which React would treat as a cleanup function.
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "end" });
  }, [lines]);
  useEffect(() => {
    setError(answer.error);
  }, [answer.error]);

  const ask = useCallback((question: string, m: AnswerMode = settings.current.mode, regenerate = false) => {
    setNotice(null);
    void answer.ask(question, m, regenerate);
  }, [answer.ask]); // eslint-disable-line react-hooks/exhaustive-deps

  const regenerate = useCallback((m: AnswerMode) => {
    if (!current) return;
    setMode(m);
    ask(current.question, m, true);
  }, [current, ask]);

  // Speech pieces are transcribed in parallel (fast), but their results are handled strictly in the
  // order they were spoken, so a slow earlier piece can never be treated as the newest question.
  const order = useRef<Promise<void>>(Promise.resolve());
  const inFlight = useRef(0);
  const lineId = useRef(0);
  const onSegment = useCallback((blob: Blob, at: { startedAt: number; endedAt: number }) => {
    inFlight.current += 1;
    setCapture((s) => (s === "idle" ? s : "transcribing"));
    const result = blob.arrayBuffer().then((buf) => window.hiremate.live.transcribe(new Uint8Array(buf), blob.type || "audio/webm"));
    order.current = order.current.then(async () => {
      try {
        const r = await result.catch(() => ({ ok: false as const, error: "Transcription failed." }));
        inFlight.current -= 1;
        if (inFlight.current === 0) setCapture(audio.current ? "listening" : "idle");
        if (!r.ok) return setError(r.error);
        const { text, unclear } = r.data;
        if (!text) return;
        const question = isLikelyQuestion(text);
        setLines((l) => [...l, { id: ++lineId.current, text, question, unclear }]);
        updateTest((t) => {
          // Only the test question itself counts: other speech (you, the room) must not make the test pass.
          if (!isTestQuestion(text)) return { ...t, other: t.other ? `${t.other} ${text}` : text };
          return {
            ...t,
            text: "ok",
            transcript: text,
            textMs: t.textMs ?? Math.round(performance.now() - t.startedAt),
            question: question && !unclear ? "ok" : t.question,
          };
        });
        if (unclear) {
          // Don't guess: a badly heard question gets no automatic answer, and isn't joined to the next one.
          pending.current = [];
          if (question) setNotice(UNCLEAR);
          return;
        }
        // Same breath: speech that starts within 1 s of the last question ending is the rest of that
        // question (a short pause cut it in two), so the whole question is answered, not half of it.
        const last = lastAsked.current;
        if (last && at.startedAt - last.endedAt < CONTINUE_MS) {
          const whole = `${last.question} ${text}`.replace(/\s+/g, " ").trim().slice(-1000);
          lastAsked.current = { question: whole, endedAt: at.endedAt };
          pending.current = [];
          if (settings.current.autoAnswer) ask(whole);
          return;
        }
        pending.current.push({ text, ...at });
        const q = pendingQuestion(pending.current);
        if (q) {
          pending.current = [];
          lastAsked.current = { question: q, endedAt: at.endedAt };
          if (settings.current.autoAnswer) ask(q);
        } else if (pending.current.length > 3) pending.current = pending.current.slice(-3);
      } catch (e) {
        // One bad piece must never stop the pieces after it from being handled.
        setError(e instanceof Error ? e.message : "Couldn't handle that piece of speech.");
      }
    });
  }, [ask]);

  // Sound inputs (e.g. "Stereo Mix", a virtual cable, a microphone), and the playback device that
  // "Computer sound" records: Windows' default one. Names show only during a live session.
  useEffect(() => {
    const load = () =>
      void navigator.mediaDevices.enumerateDevices().then((list) => {
        setInputs(list.filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications").map((d, i) => ({ id: d.deviceId, label: d.label || `Sound input ${i + 1}` })));
        const out = list.find((d) => d.kind === "audiooutput" && d.deviceId === "default")?.label ?? "";
        setOutputName(out.replace(/^Default\s*-\s*/i, ""));
      }).catch(() => setInputs([]));
    load();
    navigator.mediaDevices.addEventListener("devicechange", load);
    return () => navigator.mediaDevices.removeEventListener("devicechange", load);
  }, []);

  // Audio test: the first words of a reply (or an AI error) complete it.
  useEffect(() => {
    const t = testRef.current;
    if (!t || t.done || t.question !== "ok") return;
    if (current?.firstWordsMs != null && isTestQuestion(current.question)) updateTest((x) => ({ ...x, answer: "ok", answerMs: Math.round(performance.now() - x.startedAt), done: true }));
    else if (answer.status === "error") updateTest((x) => ({ ...x, answer: "fail", done: true }));
  }, [current?.firstWordsMs, answer.status, updateTest]);

  const runTest = async () => {
    const t: AudioTest = { startedAt: performance.now(), via: "speech", heard: "pending", text: "pending", question: "pending", answer: "pending", done: false };
    testRef.current = t;
    setTest(t);
    if (!audio.current) await startListening();
    if (!audio.current) return updateTest((x) => ({ ...x, heard: "fail", done: true }));
    await new Promise((r) => setTimeout(r, 700));
    const spoke = await speak(TEST_QUESTION);
    if (!spoke) {
      // No speech voice on this computer: check that sound is captured, with a tone.
      updateTest((x) => ({ ...x, via: "tone" }));
      playTone();
      setTimeout(() => updateTest((x) => ({ ...x, text: "skipped", question: "skipped", answer: "skipped", heard: x.heard === "ok" ? "ok" : "fail", done: true })), 4_000);
    }
    setTimeout(() => updateTest((x) => ({ ...x, heard: x.heard === "pending" ? "fail" : x.heard, text: x.text === "pending" ? "fail" : x.text, question: x.question === "pending" ? "fail" : x.question, answer: x.answer === "pending" ? "fail" : x.answer, done: true })), 30_000);
  };

  const startListening = async (from: AudioSource = source) => {
    setError(null);
    try {
      lastSound.current = performance.now();
      setSilentFor(0);
      audio.current = await startCapture(from, () => pauseMs.current, onSegment, () => { audio.current = null; setCapture("idle"); setLevel(0); }, (rms) => {
        setLevel(rms);
        const now = performance.now();
        if (rms >= 0.01) updateTest((t) => (t.heard === "pending" ? { ...t, heard: "ok", heardMs: Math.round(now - t.startedAt) } : t));
        if (rms >= 0.005) lastSound.current = now;
        setSilentFor(Math.floor((now - lastSound.current) / 1000));
      });
      setCapture("listening");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start listening.");
    }
  };

  const stopListening = () => {
    audio.current?.stop();
    audio.current = null;
    setCapture("idle");
    setLevel(0);
    setSilentFor(0);
  };

  const end = async () => {
    stopListening();
    await answer.cancel();
    if (onTop) await window.hiremate.window.setAlwaysOnTop(false);
    await window.hiremate.live.stop(session.id); // also closes the floating panel
    onEnd();
  };

  // Leaving the page ends the session. (The short delay ignores React's development double-mount.)
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (mounted.current) return;
        audio.current?.stop();
        void window.hiremate.live.stop(session.id);
        void window.hiremate.window.setAlwaysOnTop(false);
      }, 0);
    };
  }, [session.id]);

  // Floating panel: mirror the state, and take its button presses.
  useEffect(() => {
    void window.hiremate.panel.publish({
      status,
      question: current?.question ?? "",
      answer: parsed.body,
      mode: current?.mode ?? mode,
      questionType: parsed.questionType,
      confidence: answer.busy ? null : parsed.confidence,
      firstWordsMs: current?.firstWordsMs ?? null,
      totalMs: current?.totalMs ?? null,
      disclosure: banner,
      notice: notice ?? answer.error,
    });
  }, [status, current, parsed, mode, notice, banner, answer.busy, answer.error]);

  useEffect(
    () =>
      window.hiremate.panel.onAction((action) => {
        if (action === "regenerate") regenerate(current?.mode ?? settings.current.mode);
        else if (current) regenerate(action);
        else setMode(action);
      }),
    [regenerate, current],
  );

  const toggleTop = async () => {
    const r = await window.hiremate.window.setAlwaysOnTop(!onTop);
    if (r.ok) setOnTop(r.data);
  };
  const openPanel = async () => {
    const r = await window.hiremate.panel.open();
    if (!r.ok) setError(r.error);
  };

  return (
    <div className="pb-10 pt-10">
      {/* Always-visible disclosure notice */}
      <div role="status" className="drag-region flex flex-wrap items-center gap-3 rounded-2xl border border-violet/40 bg-violet/15 px-5 py-3 text-sm text-violet-soft">
        <ShieldCheck className="h-5 w-5 shrink-0" />
        <span className="flex-1">
          <strong className="text-mist">AI assistant in use</strong> · {meeting ? `${session.organisation} (participants informed)` : `allowed by ${session.organisation} (${session.permission})`}
          <span className="ml-3 inline-flex items-center gap-1.5 text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> AI Assistance enabled — Consent confirmed</span>
        </span>
        <button type="button" onClick={() => void end()} className="no-drag rounded-lg bg-white/10 px-3 py-1.5 font-medium text-mist hover:bg-white/15">End session</button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {capture !== "idle" ? (
          <button type="button" onClick={stopListening} className="inline-flex items-center gap-2 rounded-xl bg-rose-500/90 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500"><MicOff className="h-4 w-4" /> Stop listening</button>
        ) : (
          <button type="button" onClick={() => void startListening()} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-electric to-violet px-4 py-2.5 text-sm font-semibold text-white"><Mic className="h-4 w-4" /> Start listening</button>
        )}
        <label className="flex items-center gap-2 text-sm text-haze">
          Listen to
          <select
            value={source}
            onChange={(e) => {
              const next = e.target.value as AudioSource;
              setSource(next);
              try { localStorage.setItem(SOURCE_KEY, next); } catch { /* not remembered */ }
              if (audio.current) { stopListening(); void startListening(next); } // switch straight away
            }}
            className="max-w-56 rounded-lg border border-white/10 bg-navy-800 px-2 py-1.5 text-sm text-mist outline-none focus:border-electric/50"
          >
            <option value="system-a">{IS_WEB ? "Meeting tab or screen audio" : `Computer sound${outputName ? ` — ${outputName}` : ""}`}</option>
            {inputs.map((d) => <option key={d.id} value={`device:${d.id}`}>{d.label}</option>)}
          </select>
        </label>
        {!IS_WEB && <button
          type="button"
          onClick={() => void runTest()}
          disabled={Boolean(test && !test.done)}
          title="Plays one short test question through your speakers or headphones and checks every step. Run it before the call, or while your microphone is muted."
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-haze hover:bg-white/[0.05] hover:text-mist disabled:opacity-40"
        >
          <Stethoscope className="h-4 w-4" /> {test && !test.done ? "Testing…" : "Test audio"}
        </button>}
        <StatusChip status={status} />
        {capture !== "idle" && <SoundMeter level={level} />}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2 text-haze"><input type="checkbox" checked={autoAnswer} onChange={(e) => setAutoAnswer(e.target.checked)} className="h-4 w-4 accent-violet-500" /> Auto-answer questions</label>
          <LengthPicker mode={mode} onChange={setMode} compact />
          <label className="flex items-center gap-2 text-haze" title="How long a pause means the question has finished">
            Pause before answering
            <select
              value={pause}
              onChange={(e) => {
                const next = e.target.value as PauseChoice;
                setPause(next);
                try { localStorage.setItem(PAUSE_KEY, next); } catch { /* not remembered */ }
              }}
              className="rounded-lg border border-white/10 bg-navy-800 px-2 py-1.5 text-sm text-mist outline-none focus:border-electric/50"
            >
              {PAUSE_CHOICES.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.ms / 1000} s)</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void openPanel()} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-haze hover:bg-white/[0.05] hover:text-mist">
            <PanelTopOpen className="h-4 w-4" /> Floating panel
          </button>
          {!IS_WEB && (
            <button type="button" onClick={() => void toggleTop()} aria-pressed={onTop} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-haze hover:bg-white/[0.05] hover:text-mist">
              {onTop ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />} {onTop ? "Unpin" : "Keep on top"}
            </button>
          )}
        </div>
      </div>

      {source.startsWith("device:") && (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-haze">
          A microphone hears <strong className="text-mist">you and the room</strong>, not the other side of a call in your headphones. For Google Meet, Teams or Zoom choose <strong className="text-mist">Computer sound</strong>.
        </p>
      )}
      {test && <AudioTestCard test={test} outputName={source.startsWith("device:") ? (inputs.find((d) => `device:${d.id}` === source)?.label ?? "the selected input") : outputName} microphone={source.startsWith("device:")} onClose={() => { testRef.current = null; setTest(null); }} />}
      {error && <p role="alert" className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">{error}</p>}
      {capture !== "idle" && silentFor >= 12 && (
        <p role="status" className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-100">
          {source.startsWith("device:") ? "No sound from this input" : IS_WEB ? "No meeting sound" : "No computer sound"} for {silentFor} seconds. Check that the call or a video is playing and isn't muted.
          {source === "system-a" && (IS_WEB ? <> Stop listening, start again, and make sure you turn on <strong>Also share tab audio</strong> in the browser&apos;s share window.</> : <> If the call is playing, press <strong>Test audio</strong> to find out why.</>)}
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <section className="glass flex h-[60vh] flex-col rounded-3xl p-5" aria-label="Transcript">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-haze">{meeting ? "Meeting (live transcript)" : "Interviewer (live transcript)"}</h2>
            {lines.length > 0 && <button type="button" onClick={() => { setLines([]); pending.current = []; lastAsked.current = null; }} className="text-xs text-dim hover:text-mist">Clear</button>}
          </div>
          <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1" data-selectable>
            {lines.length === 0 && <p className="text-sm text-dim">{capture !== "idle" ? "Listening… questions appear here as they're asked." : IS_WEB ? "Press Start listening, choose the meeting tab, and turn on \"Also share tab audio\"." : "Press Start listening. HireMate hears what plays through your speakers or headphones."}</p>}
            {lines.map((l) => (
              <div key={l.id} className={`group rounded-xl px-3 py-2 text-sm ${l.unclear ? "border border-dashed border-amber-400/30 text-amber-100/80" : l.question ? "bg-electric/10 text-mist" : "text-haze"}`}>
                {l.text}
                {l.unclear && <span className="ml-2 text-xs text-amber-200">unclear audio</span>}
                <button type="button" onClick={() => ask(l.text)} className="ml-2 inline-flex items-center gap-1 text-xs text-electric-soft opacity-60 hover:opacity-100 group-hover:opacity-100 focus:opacity-100">
                  <Wand2 className="h-3 w-3" /> Answer this
                </button>
              </div>
            ))}
            <div ref={transcriptEnd} />
          </div>
        </section>

        <section className="glass flex h-[60vh] flex-col rounded-3xl p-5" aria-live="polite" aria-label="Suggested answer">
          <h2 className="text-sm font-semibold text-haze">{meeting ? "Suggested reply" : "Suggested answer"}</h2>
          <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
            {notice && <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {notice} Ask them to repeat it, or press "Answer this" on the line if it reads correctly.</p>}
            {!current ? (
              !notice && <p className="text-sm text-dim">Answers appear here as soon as a question is detected.</p>
            ) : (
              <>
                <p className="text-[15px] font-semibold text-mist" data-selectable>{current.question}</p>
                <AnswerMeta questionType={parsed.questionType} confidence={answer.busy ? null : parsed.confidence} firstWordsMs={current.firstWordsMs} totalMs={current.totalMs} />
                {answer.busy && !parsed.body ? <p className="flex items-center gap-2 text-sm text-electric-soft"><Loader2 className="h-4 w-4 animate-spin" /> {stageText(answer.stage)}</p> : <Markdown text={parsed.body} streaming={status === "answering"} />}
                {!answer.busy && <VerifyWarning confidence={parsed.confidence} />}
                {answer.status === "error" && answer.error && (
                  <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {answer.error}
                  </p>
                )}
              </>
            )}
          </div>
          {current && !answer.busy && (parsed.body || answer.status === "error") && (
            <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-white/[0.06] pt-3">
              {parsed.body && <CopyButton text={parsed.body} label="Copy answer" />}
              <RegenerateButton onClick={() => regenerate(current.mode)} />
              <span className="ml-auto" />
              <LengthPicker mode={current.mode} onChange={regenerate} compact />
            </div>
          )}
        </section>
      </div>

      {earlier.length > 1 && (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-haze">Earlier in this {meeting ? "meeting" : "interview"}</h2>
          <div className="space-y-2">
            {earlier.slice(1).map((h) => (
              <details key={h.at} className="glass rounded-2xl px-5 py-3 text-sm">
                <summary className="cursor-pointer text-mist">{h.question}</summary>
                <div className="mt-3 border-t border-white/[0.06] pt-3"><Markdown text={h.answer} /></div>
              </details>
            ))}
          </div>
        </section>
      )}
      <p className="mt-3 text-xs text-dim">Answers are suggestions from your profile; say them in your own words. HireMate never speaks into the meeting and never saves the audio. Disclosure line: <span data-selectable>{disclosure(session.purpose, session.organisation)}</span></p>
    </div>
  );
}

const IS_WEB = typeof window !== "undefined" && window.hiremate?.platform === "web";

const TEST_QUESTION = "Can you tell me about your experience with REST APIs?";
const TEST_WORDS = ["tell", "experience", "rest", "apis"];
/** Did this line (or the question built from it) come from the test question? */
const isTestQuestion = (text: string) => {
  const t = text.toLowerCase();
  return TEST_WORDS.filter((w) => t.includes(w)).length >= 3;
};

type TestStep = "pending" | "ok" | "fail" | "skipped";
interface AudioTest {
  startedAt: number;
  via: "speech" | "tone";
  heard: TestStep;
  text: TestStep;
  question: TestStep;
  answer: TestStep;
  transcript?: string;
  /** Speech heard during the test that wasn't the test question (you, the room). */
  other?: string;
  heardMs?: number;
  textMs?: number;
  answerMs?: number;
  done: boolean;
}

/** Speaks through the default playback device, which is what "Computer sound" records. */
function speak(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve(false);
    let started = false;
    const go = () => {
      if (started) return;
      const voices = synth.getVoices();
      if (!voices.length) return resolve(false);
      started = true;
      try {
        const u = new SpeechSynthesisUtterance(text);
        try {
          u.voice = voices.find((v) => /^en/i.test(v.lang)) ?? voices[0];
        } catch {
          /* keep the default voice */
        }
        u.onstart = () => resolve(true);
        u.onerror = () => resolve(false);
        synth.cancel();
        synth.speak(u);
      } catch {
        resolve(false); // speaking failed: the tone check is used instead
      }
      setTimeout(() => resolve(false), 4_000);
    };
    if (synth.getVoices().length) go();
    else {
      synth.addEventListener("voiceschanged", go, { once: true });
      setTimeout(() => (synth.getVoices().length ? go() : resolve(false)), 1_500);
    }
  });
}

function playTone() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 440;
  gain.gain.value = 0.25;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1.5);
  osc.onended = () => void ctx.close();
}

function AudioTestCard({ test, outputName, microphone, onClose }: { test: AudioTest; outputName: string; microphone: boolean; onClose: () => void }) {
  const device = outputName || (microphone ? "the selected input" : "your default playback device");
  const sec = (ms?: number) => (ms != null ? ` · ${(ms / 1000).toFixed(1)} s` : "");
  const rows: { step: TestStep; label: string }[] = [
    { step: test.heard, label: `Sound captured from ${device}${sec(test.heardMs)}` },
    { step: test.text, label: `Speech turned into text${test.transcript ? `: "${test.transcript}"` : ""}${sec(test.textMs)}` },
    { step: test.question, label: "Question detected" },
    { step: test.answer, label: `Suggested reply started${sec(test.answerMs)}` },
  ];
  const firstFail = rows.findIndex((r) => r.step === "fail");
  const advice = [
    <>HireMate heard nothing from <strong>{device}</strong>. Check: (1) the volume isn&apos;t muted; (2) in Google Meet → <em>Settings → Audio → Speakers</em>, choose <strong>{device}</strong> (the device Windows uses as default), or make Meet&apos;s speaker the default in Windows <em>Sound settings → Output</em>; (3) Bluetooth headsets switch to a separate &quot;Hands-Free&quot; device during calls: make that the default, or use a wired/USB headset. If it still hears nothing, enable <strong>Stereo Mix</strong> (Windows Sound settings → Recording) or install the free VB-CABLE, and choose it in <strong>Listen to</strong>.</>,
    microphone ? (
      <>The test question played in your speakers or headphones, but <strong>{device}</strong> is a microphone{test.other ? <> and only heard: &quot;{test.other}&quot;</> : null}. Choose <strong>Computer sound</strong> in <strong>Listen to</strong> and test again.</>
    ) : test.other ? (
      <>HireMate heard other speech (&quot;{test.other}&quot;) but not the test question. Stay quiet during the test, make sure nothing else is playing, and test again.</>
    ) : (
      <>Sound arrived but wasn&apos;t turned into text. Check the red message above (usually the Groq key or the free-plan limit), then test again.</>
    ),
    <>The words arrived but weren&apos;t recognised as a question. Press <strong>Answer this</strong> on the line, or ask in a full sentence.</>,
    <>The question was detected but no reply came. See the message in the Suggested reply box, or try another model in Settings.</>,
  ];
  return (
    <section aria-label="Audio test" className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-mist">Audio test {test.done ? (firstFail === -1 ? "passed" : "found a problem") : "running…"}</h2>
        {test.done && <button type="button" onClick={onClose} className="text-xs text-dim hover:text-mist">Close</button>}
      </div>
      {!test.done && <p className="mt-1 text-haze">Playing a test question through {device}: &quot;{TEST_QUESTION}&quot;</p>}
      <ul className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <li key={r.label.slice(0, 12)} className="flex items-start gap-2">
            {r.step === "ok" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : r.step === "fail" ? <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" /> : r.step === "skipped" ? <span className="mt-0.5 w-4 shrink-0 text-center text-dim">–</span> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-electric-soft" />}
            <span className={r.step === "fail" ? "text-rose-200" : r.step === "skipped" ? "text-dim" : "text-haze"} data-selectable>{r.label}</span>
          </li>
        ))}
      </ul>
      {test.via === "tone" && test.done && <p className="mt-2 text-xs text-dim">This computer has no speech voice, so a tone was used: only sound capture was checked.</p>}
      {test.done && firstFail >= 0 && <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-amber-100">{advice[firstFail]}</p>}
      {test.done && firstFail === -1 && test.via === "speech" && <p className="mt-3 text-emerald-200">Everything works. If a Meet participant still isn&apos;t heard, make sure Meet plays through {device}.</p>}
    </section>
  );
}

/** Live input level, so you can see that the meeting sound is reaching HireMate. */
function SoundMeter({ level }: { level: number }) {
  const pct = Math.min(100, Math.round((Math.sqrt(level) / Math.sqrt(0.2)) * 100));
  const bars = [10, 25, 45, 65, 85];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-haze" title="Computer sound level">
      Sound
      <span className="flex h-4 items-end gap-0.5" aria-label={`Sound level ${pct}%`} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        {bars.map((b, i) => (
          <span key={b} className={`w-1 rounded-sm ${pct >= b ? "bg-emerald-400" : "bg-white/15"}`} style={{ height: `${40 + i * 15}%` }} />
        ))}
      </span>
    </span>
  );
}

function StatusChip({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string; icon: JSX.Element }> = {
    idle: { label: "Not listening", cls: "text-dim", icon: <MicOff className="h-4 w-4" /> },
    listening: { label: "Listening", cls: "text-success", icon: <Ear className="h-4 w-4 animate-pulse" /> },
    transcribing: { label: "Transcribing", cls: "text-sky-300", icon: <Loader2 className="h-4 w-4 animate-spin" /> },
    thinking: { label: "Thinking", cls: "text-electric-soft", icon: <Loader2 className="h-4 w-4 animate-spin" /> },
    answering: { label: "Answering", cls: "text-violet-soft", icon: <Square className="h-3.5 w-3.5 animate-pulse" /> },
  };
  const s = map[status];
  return <span aria-live="polite" className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-sm ${s.cls}`}>{s.icon}{s.label}</span>;
}

/* ---------- Audio capture ---------- */

/**
 * Captures the computer's sound (Windows loopback), cuts it into speech segments,
 * and hands each segment (webm/opus) to onSegment. The screen picture is never recorded.
 */
/** Where the meeting sound comes from. */
export type AudioSource = "system-a" | `device:${string}`;
const SOURCE_KEY = "hiremate.liveAudioSource";
const PAUSE_KEY = "hiremate.livePause";

function readPause(): PauseChoice {
  try {
    const v = localStorage.getItem(PAUSE_KEY);
    if (PAUSE_CHOICES.some((c) => c.id === v)) return v as PauseChoice;
  } catch {
    /* storage unavailable */
  }
  return "fast";
}
const pauseToMs = (p: PauseChoice) => PAUSE_CHOICES.find((c) => c.id === p)?.ms ?? 500;

function readSource(): AudioSource {
  try {
    const v = localStorage.getItem(SOURCE_KEY);
    if (v === "system-a" || v?.startsWith("device:")) return v as AudioSource; // the old "method 2" falls back to computer sound
  } catch {
    /* storage unavailable */
  }
  return "system-a";
}

const RAW_AUDIO: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

/** Opens the chosen source. Returns the audio tracks plus any screen track that must stay open (never recorded). */
async function openSource(source: AudioSource): Promise<{ audio: MediaStreamTrack[]; keepAlive: MediaStreamTrack[] }> {
  if (source === "system-a") {
    let stream: MediaStream;
    try {
      // Raw meeting sound: echo cancellation would remove the very voices the speakers are playing
      // (the other participants), and auto gain keeps turning the system sound down.
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: RAW_AUDIO, systemAudio: "include" } as DisplayMediaStreamOptions);
    } catch (e) {
      console.warn("[live] computer sound failed:", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      if (e instanceof Error && e.name === "NotReadableError") {
        throw new Error("Windows couldn't open your playback device for listening. Check that your speakers or headset are connected and not in use exclusively by another app (Windows Sound settings → device Properties → Advanced → untick \"Allow applications to take exclusive control\"), then try again.");
      }
      if (IS_WEB) throw new Error(e instanceof Error && e.name === "NotAllowedError" ? "Sharing was cancelled. Press Start listening and choose the meeting tab." : "The browser couldn't share the meeting audio. Use Chrome or Edge, then try again.");
      throw new Error("Computer sound couldn't be started. Close HireMate and open it again, then try once more.");
    }
    const audio = stream.getAudioTracks();
    await Promise.all(audio.map((t) => t.applyConstraints(RAW_AUDIO).catch(() => undefined))); // make sure, on every Chromium version
    console.info("[live] computer sound track:", JSON.stringify(audio[0]?.getSettings() ?? {}));
    return { audio, keepAlive: stream.getVideoTracks() };
  }
  const deviceId = source.slice("device:".length);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId }, ...RAW_AUDIO },
    });
    return { audio: stream.getAudioTracks(), keepAlive: [] };
  } catch {
    throw new Error("That sound input couldn't be opened. Is it plugged in and enabled in Windows Sound settings?");
  }
}

async function startCapture(source: AudioSource, getPauseMs: () => number, onSegment: (blob: Blob, at: { startedAt: number; endedAt: number }) => void, onEnded: () => void, onLevel: (level: number) => void) {
  // Create the audio engine while the click is still "fresh": Windows/Chromium may otherwise start it
  // paused, and a paused engine hears only silence.
  const ctx = new AudioContext();
  let opened: Awaited<ReturnType<typeof openSource>>;
  try {
    opened = await openSource(source);
  } catch (e) {
    void ctx.close();
    throw e;
  }
  // A screen track is kept alive but unused: stopping it can also stop the system sound on Windows.
  const videoTracks = opened.keepAlive;
  videoTracks.forEach((t) => (t.enabled = false));
  const tracks = opened.audio;
  if (tracks.length === 0) {
    videoTracks.forEach((t) => t.stop());
    void ctx.close();
    throw new Error(IS_WEB ? "The meeting was shared without its sound. Press Start listening again and turn on \"Also share tab audio\" (or \"Also share system audio\")." : "No sound came through. Choose another option in \"Listen to\".");
  }
  const audioStream = new MediaStream(tracks);
  if (ctx.state !== "running") await ctx.resume().catch(() => undefined);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(audioStream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const segmenter = new SpeechSegmenter({ silenceMs: getPauseMs() });

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
  let recorder: MediaRecorder | null = null;
  let keep = false;
  let inSpeech = false;
  let spokeAt = 0; // when the current piece of speech started
  let quietAt = 0; // when it stopped
  let cutAt = performance.now();
  let stopped = false;

  const startRecorder = () => {
    const chunks: Blob[] = [];
    const r = new MediaRecorder(audioStream, { mimeType });
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      if (keep && chunks.length) onSegment(new Blob(chunks, { type: mimeType }), { startedAt: spokeAt, endedAt: quietAt });
      keep = false;
      if (!stopped) startRecorder();
    };
    r.start();
    recorder = r;
    cutAt = performance.now();
  };
  startRecorder();

  const timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    const now = performance.now();
    const rms = Math.sqrt(sum / samples.length);
    onLevel(rms);
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    segmenter.setSilenceMs(getPauseMs()); // follows the "Pause before answering" choice, even mid-session
    const ev = segmenter.feed(rms, now);
    if (ev?.type === "speech-start") {
      inSpeech = true;
      spokeAt = now;
    }
    if (ev?.type === "segment-end") {
      inSpeech = false;
      quietAt = now;
      keep = ev.hadSpeech;
      recorder?.stop();
    } else if (!inSpeech && now - cutAt > 8000) {
      keep = false; // drop long silences instead of uploading them
      recorder?.stop();
    }
  }, 50); // check the sound level 20 times a second, so the end of a question is noticed quickly

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(timer);
    if (recorder?.state === "recording") recorder.stop();
    tracks.forEach((t) => t.stop());
    videoTracks.forEach((t) => t.stop());
    void ctx.close();
  };
  const ended = () => { if (!stopped) { stop(); onEnded(); } };
  tracks[0].addEventListener("ended", ended); // sharing stopped from outside the app
  videoTracks[0]?.addEventListener("ended", ended);
  return { stop };
}
