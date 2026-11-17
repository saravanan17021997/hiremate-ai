// Phone screen: your phone shows the live session running on your laptop. The laptop hears the meeting
// (Meet/Teams tab audio), finds the question and writes the reply; this page only displays it, instantly,
// and sends the buttons you press back to the laptop. The disclosure stays on screen the whole time.
import { AlertTriangle, ArrowLeft, Ear, Laptop, Loader2, MicOff, RefreshCw, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { AnswerMode, FeedLink, PanelAction, PhoneFeed } from "@shared/types";
import { APP_NAME } from "@shared/brand";
import { Logo } from "../components/Logo";
import { Markdown } from "../components/Markdown";
import { AnswerMeta, CopyButton, VerifyWarning } from "../components/AnswerParts";
import { acceptFeed, seenRecently } from "../lib/phoneFeed";

const LAPTOP_QUIET_MS = 30_000; // no sign of the laptop for this long = it isn't responding
const PRESS_TIMEOUT_MS = 8_000;

export function PhoneScreen() {
  const phone = window.hiremate.phone;
  const [feed, setFeed] = useState<PhoneFeed | null>(null);
  const [link, setLink] = useState<FeedLink>("connecting");
  const [now, setNow] = useState(() => Date.now());
  const laptop = useRef({ seen: null as string | null, changedAt: 0 });
  const [pending, setPending] = useState<{ action: PanelAction; seq: number; requestId: string | null; mode: AnswerMode | null; at: number } | null>(null);
  const [pressFailed, setPressFailed] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);

  // Live updates (newest only: an older update arriving late never replaces newer text).
  useEffect(() => {
    if (!phone.available) return;
    return phone.watch((next) => setFeed((prev) => acceptFeed(prev, next)), setLink);
  }, [phone]);

  // "Phone screen open", so the laptop can show it's connected.
  useEffect(() => {
    if (!phone.available) return;
    const beat = () => { if (document.visibilityState === "visible") void phone.seen("viewer"); };
    beat();
    const t = window.setInterval(beat, 8_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [phone]);

  // Keep the screen on while this page is open (where the browser supports it).
  useEffect(() => {
    type Lock = { release(): Promise<void> };
    const wl = (navigator as unknown as { wakeLock?: { request(type: "screen"): Promise<Lock> } }).wakeLock;
    if (!wl) return;
    let lock: Lock | null = null;
    const get = () => { if (document.visibilityState === "visible") void wl.request("screen").then((l) => (lock = l)).catch(() => undefined); };
    get();
    document.addEventListener("visibilitychange", get);
    return () => {
      document.removeEventListener("visibilitychange", get);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(t);
  }, []);

  // Track the laptop's heartbeat.
  if (feed && feed.laptopSeenAt !== laptop.current.seen) {
    if (laptop.current.seen !== null) laptop.current.changedAt = Date.now();
    laptop.current.seen = feed.laptopSeenAt;
  }
  const laptopHere = seenRecently(feed?.laptopSeenAt ?? null, laptop.current.changedAt, now, LAPTOP_QUIET_MS);

  const state = feed?.active ? feed.state : null;
  const seq = feed?.seq ?? 0;

  // A new question: back to the top, and any pending press for the old one is dropped.
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
    setPending((p) => (p && p.seq !== seq ? null : p));
  }, [seq]);

  // A pressed button is done when the laptop starts the new answer (or switches length).
  useEffect(() => {
    if (!pending || !state) return;
    if (state.requestId !== pending.requestId) setPending(null);
  }, [state, pending]);
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => {
      setPending(null);
      setPressFailed("The laptop didn't respond. Check that the Live Assistant page is still open on it.");
    }, PRESS_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [pending]);

  const press = async (action: PanelAction) => {
    if (!state) return;
    setPressFailed(null);
    setPending({ action, seq, requestId: state.requestId, mode: action === "regenerate" ? null : action, at: Date.now() });
    const r = await phone.request({ id: crypto.randomUUID(), action, seq, at: Date.now() });
    if (!r.ok) {
      setPending(null);
      setPressFailed(r.error);
    }
  };

  if (!phone.available) {
    return (
      <Shell link={null}>
        <p className="glass rounded-3xl p-6 text-sm text-haze">Phone screen is part of the web version. On your phone, open your {APP_NAME} website and sign in with the same account.</p>
      </Shell>
    );
  }

  const busy = state ? state.status === "thinking" || state.status === "answering" : false;
  const processing = busy || state?.status === "transcribing";
  const ready = Boolean(state && state.answer && !busy && state.question);

  return (
    <Shell link={link}>
      <div ref={top} />
      {!feed?.active ? (
        <Waiting ended={Boolean(feed && feed.sessionId && !feed.active)} />
      ) : (
        <>
          <div role="status" className="flex items-start gap-2 rounded-2xl border border-violet/40 bg-violet/15 px-4 py-3 text-sm text-violet-soft">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {state?.disclosure ?? "AI assistant in use"}
              <span className="mt-1 flex items-center gap-1.5 text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> AI Assistance enabled — Consent confirmed</span>
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Chip tone={laptopHere ? "ok" : "bad"} icon={<Laptop className="h-3.5 w-3.5" />}>
              {laptopHere ? "Laptop connected" : `Laptop not responding${feed.laptopSeenAt ? ` (${ago(feed.laptopSeenAt, now)})` : ""}`}
            </Chip>
            {state && (
              <Chip tone={state.audio === "listening" ? "ok" : state.audio === "paused" ? "dim" : "bad"} icon={state.audio === "listening" ? <Ear className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}>
                {state.audio === "listening" ? "Listening" : state.audio === "paused" ? "Paused" : "Audio unavailable"}
              </Chip>
            )}
            {processing && <Chip tone="busy" icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}>Processing</Chip>}
            {ready && <Chip tone="ok">Answer ready</Chip>}
          </div>
          {state?.audioNote && <p className="mt-2 text-xs text-amber-100">{state.audioNote}</p>}

          <section aria-label="Current question" className="glass mt-3 rounded-3xl p-5">
            <p className="text-xs font-medium text-dim">{seq > 0 && state?.question ? `Question #${seq}` : "Current question"}</p>
            <p className="mt-1.5 text-lg font-semibold leading-snug text-mist" data-selectable>{state?.question || "No question yet. It appears here as soon as someone asks one."}</p>
          </section>

          {state?.question && (
            <section aria-label="Suggested reply" aria-live="polite" className="glass mt-3 rounded-3xl p-5">
              <p className="mb-2 text-xs font-medium text-dim">{seq > 0 ? `Suggested reply #${seq}` : "Suggested reply"}</p>
              {state.notice && (
                <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {state.notice}
                </p>
              )}
              {busy && !state.answer ? (
                <p className="flex items-center gap-2 text-sm text-electric-soft"><Loader2 className="h-4 w-4 animate-spin" /> Writing the reply…</p>
              ) : (
                <div className="text-[15px]"><Markdown text={state.answer} streaming={state.status === "answering"} /></div>
              )}
              <div className="mt-3"><AnswerMeta questionType={state.questionType} confidence={state.confidence} firstWordsMs={state.firstWordsMs} totalMs={state.totalMs} /></div>
              {!busy && <VerifyWarning confidence={state.confidence} />}
            </section>
          )}
          {pressFailed && <p role="alert" className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{pressFailed}</p>}
          <div className="h-24" />

          {/* Buttons stay at the bottom, within thumb reach. */}
          <div className="fixed inset-x-0 bottom-0 border-t border-white/[0.08] bg-navy-950/90 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur-xl">
            <div className="mx-auto flex max-w-xl items-center gap-1.5">
              {(["short", "medium", "detailed"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={!state?.question || Boolean(pending)}
                  aria-pressed={state?.mode === m}
                  onClick={() => void press(m)}
                  className={`flex-1 rounded-xl px-2 py-2.5 text-sm disabled:opacity-40 ${state?.mode === m ? "bg-white/[0.12] text-mist" : "text-haze"}`}
                >
                  {pending?.action === m ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
              <button type="button" disabled={!state?.question || busy || Boolean(pending)} onClick={() => void press("regenerate")} aria-label="Regenerate" className="rounded-xl px-3 py-2.5 text-haze disabled:opacity-40">
                {pending?.action === "regenerate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
              {state?.answer && !busy ? <CopyButton text={state.answer} label="Copy" /> : <span className="w-[68px]" />}
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({ link, children }: { link: FeedLink | null; children: React.ReactNode }) {
  return (
    <div className="app-backdrop min-h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 pb-6 pt-[max(env(safe-area-inset-top),1rem)]">
        <header className="mb-4 flex items-center gap-3">
          <Link to="/" aria-label="Back to the app" className="rounded-lg p-1.5 text-haze hover:text-mist"><ArrowLeft className="h-5 w-5" /></Link>
          <Logo size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-mist">{APP_NAME}</p>
            <p className="text-xs text-dim">Phone screen</p>
          </div>
          {link && <LinkChip link={link} />}
        </header>
        {children}
      </div>
    </div>
  );
}

function LinkChip({ link }: { link: FeedLink }) {
  const map: Record<FeedLink, { label: string; cls: string; icon: JSX.Element }> = {
    live: { label: "Live", cls: "text-emerald-300 border-emerald-400/30", icon: <Wifi className="h-3.5 w-3.5" /> },
    polling: { label: "Updating every second", cls: "text-amber-200 border-amber-400/30", icon: <Wifi className="h-3.5 w-3.5" /> },
    connecting: { label: "Connecting…", cls: "text-haze border-white/10", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    offline: { label: "Offline: reconnecting…", cls: "text-rose-300 border-rose-400/40", icon: <WifiOff className="h-3.5 w-3.5" /> },
  };
  const s = map[link];
  return <span role="status" aria-label={`Connection: ${s.label}`} className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${s.cls}`}>{s.icon}{s.label}</span>;
}

function Chip({ tone, icon, children }: { tone: "ok" | "bad" | "dim" | "busy"; icon?: JSX.Element; children: React.ReactNode }) {
  const cls = { ok: "border-emerald-400/30 text-emerald-300", bad: "border-rose-400/40 text-rose-300", dim: "border-white/10 text-haze", busy: "border-electric/40 text-electric-soft" }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${cls}`}>{icon}{children}</span>;
}

function Waiting({ ended }: { ended: boolean }) {
  return (
    <section className="glass rounded-3xl p-6">
      <h1 className="text-lg font-semibold text-mist">{ended ? "The live session has ended" : "Waiting for your laptop"}</h1>
      <p className="mt-2 text-sm text-haze">This page updates by itself. Keep it open.</p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-haze">
        <li>On your laptop, open {APP_NAME} in Chrome or Edge and sign in with the <strong className="text-mist">same account</strong>.</li>
        <li>Live Assistant → confirm consent → <strong className="text-mist">Start listening</strong> → choose the Google Meet or Teams tab and turn on <strong className="text-mist">Also share tab audio</strong>.</li>
        <li>Each question and its suggested reply appear here as soon as they&apos;re detected.</li>
      </ol>
    </section>
  );
}

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
}
