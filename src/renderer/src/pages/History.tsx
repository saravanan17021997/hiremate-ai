// Interview History: saved sessions (questions and suggested answers). Delete one or all of them,
// on this PC and in your account. Meeting audio is never saved, so there is no audio to delete.
import { ChevronDown, History as HistoryIcon, Loader2, Radio, Search, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { SessionRecord } from "@shared/types";
import { parseAnswer } from "@shared/answerMeta";
import { PageHeader } from "../components/PageHeader";
import { Markdown } from "../components/Markdown";
import { useIpc } from "../lib/useIpc";

const KIND = { workspace: { label: "AI Interview", icon: Sparkles }, mock: { label: "Mock interview", icon: HistoryIcon }, live: { label: "Live Assistant", icon: Radio } } as const;

export function History() {
  const load = useCallback(() => window.hiremate.sessions.list(), []);
  const { data, error: loadError } = useIpc(load);
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<string | "all" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (data) setSessions(data);
  }, [data]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!sessions || !q) return sessions ?? [];
    return sessions.filter((s) => s.title.toLowerCase().includes(q) || s.questions.some((i) => i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q)));
  }, [sessions, query]);

  const remove = async (id: string | "all") => {
    setDeleting(true);
    setError(null);
    const r = await window.hiremate.sessions.delete(id);
    setDeleting(false);
    setConfirm(null);
    if (!r.ok) return setError(r.error);
    setSessions(r.data);
    setNotice(id === "all" ? "All sessions deleted from this PC and your account." : "Session deleted from this PC and your account.");
  };

  return (
    <>
      <PageHeader
        title="Interview History"
        subtitle="Questions and suggested answers from your sessions. Meeting audio is never saved: it is sent for transcription and discarded."
        actions={
          sessions && sessions.length > 0 && (
            <button type="button" onClick={() => setConfirm("all")} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/30 px-4 py-2.5 text-sm text-rose-200 hover:bg-rose-500/10">
              <Trash2 className="h-4 w-4" /> Delete all
            </button>
          )
        }
      />
      <div className="space-y-4 pb-12">
        {confirm === "all" && (
          <ConfirmBar text={`Delete all ${sessions?.length ?? 0} sessions and their transcripts? This removes them from this PC and your HireMate account and can't be undone.`} busy={deleting} onConfirm={() => void remove("all")} onCancel={() => setConfirm(null)} confirmLabel="Delete all" />
        )}
        {(error || loadError) && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error ?? loadError}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{notice}</p>}

        {!sessions ? (
          !loadError && <p className="flex items-center gap-2 text-sm text-haze"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        ) : sessions.length === 0 ? (
          <section className="glass rounded-3xl p-7 text-sm text-haze">
            No saved sessions. Questions you ask in <Link to="/ai-interview" className="text-electric-soft underline-offset-4 hover:underline">AI Interview</Link> or the <Link to="/live" className="text-electric-soft underline-offset-4 hover:underline">Live Assistant</Link> appear here.
          </section>
        ) : (
          <>
            <label className="relative block max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
              <span className="sr-only">Search sessions</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions and answers" className="w-full rounded-xl border border-white/10 bg-navy-800 py-2.5 pl-9 pr-3 text-sm text-mist outline-none focus:border-electric/50" />
            </label>
            {shown.length === 0 && <p className="text-sm text-haze">Nothing matches "{query}".</p>}
            {shown.map((s) => (
              <SessionCard key={s.id} session={s} confirming={confirm === s.id} busy={deleting} onDelete={() => setConfirm(s.id)} onConfirm={() => void remove(s.id)} onCancel={() => setConfirm(null)} />
            ))}
          </>
        )}
      </div>
    </>
  );
}

function SessionCard({ session, confirming, busy, onDelete, onConfirm, onCancel }: { session: SessionRecord; confirming: boolean; busy: boolean; onDelete: () => void; onConfirm: () => void; onCancel: () => void }) {
  const [open, setOpen] = useState(false);
  const kind = KIND[session.kind];
  const Icon = kind.icon;
  return (
    <section className="glass rounded-2xl">
      <div className="flex items-center gap-3 px-5 py-4">
        <Icon className="h-4 w-4 shrink-0 text-electric-soft" />
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium text-mist">{session.title}</span>
          <span className="block text-xs text-dim">
            {kind.label} · {new Date(session.startedAt).toLocaleString()} · {session.questions.length} {session.questions.length === 1 ? "question" : "questions"}
            {session.consent && ` · consent: ${session.consent.permission}`}
          </span>
        </button>
        <ChevronDown className={`h-4 w-4 shrink-0 text-dim transition-transform ${open ? "rotate-180" : ""}`} />
        <button type="button" onClick={onDelete} aria-label={`Delete ${session.title}`} className="rounded-lg p-2 text-dim hover:bg-rose-500/10 hover:text-rose-200">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {confirming && (
        <div className="px-5 pb-4">
          <ConfirmBar text="Delete this session and its transcript from this PC and your account? This can't be undone." busy={busy} onConfirm={onConfirm} onCancel={onCancel} confirmLabel="Delete session" />
        </div>
      )}
      {open && (
        <div className="space-y-4 border-t border-white/[0.06] px-5 py-4">
          {session.questions.length === 0 && <p className="text-sm text-dim">No questions were answered in this session.</p>}
          {session.questions.map((q, i) => (
            <div key={`${q.askedAt}-${i}`}>
              <p className="text-sm font-semibold text-mist" data-selectable>{q.question}</p>
              <div className="mt-1.5 text-sm"><Markdown text={parseAnswer(q.answer).body} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ConfirmBar({ text, busy, onConfirm, onCancel, confirmLabel }: { text: string; busy: boolean; onConfirm: () => void; onCancel: () => void; confirmLabel: string }) {
  return (
    <div role="alertdialog" aria-label={confirmLabel} className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
      <span className="min-w-0 flex-1">{text}</span>
      <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg px-3 py-1.5 text-haze hover:text-mist">Cancel</button>
      <button type="button" onClick={onConfirm} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-rose-500/90 px-3 py-1.5 font-semibold text-white hover:bg-rose-500 disabled:opacity-60">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirmLabel}
      </button>
    </div>
  );
}
