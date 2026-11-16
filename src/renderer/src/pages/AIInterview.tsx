// AI Interview: type an interview question, get an answer suggestion built from your own profile, projects and job description.
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Info, Loader2, MessageSquarePlus, Send, Sparkles, Square } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { AnswerMode, SessionItem } from "@shared/types";
import { PageHeader } from "../components/PageHeader";
import { Markdown } from "../components/Markdown";
import { useIpc } from "../lib/useIpc";
import { stageText, useAnswer } from "../lib/useAnswer";
import { parseAnswer } from "@shared/answerMeta";
import { AnswerMeta, CopyButton, LengthPicker, RegenerateButton, VerifyWarning } from "../components/AnswerParts";

const STARTERS = [
  "Tell me about yourself.",
  "Walk me through a project you're proud of.",
  "Why are you looking for a change?",
  "Describe a difficult problem you solved.",
  "How do you handle a failing integration in production?",
  "What is a REST API and how have you used one?",
];

export function AIInterview() {
  const getContext = useCallback(() => window.hiremate.interview.context(), []);
  const { data: ctx } = useIpc(getContext);

  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<AnswerMode>("medium");
  const [history, setHistory] = useState<SessionItem[]>([]);
  const sessionRef = useRef<string | undefined>(undefined);

  const answer = useAnswer({
    getSessionId: () => sessionRef.current,
    onSessionId: (id) => (sessionRef.current = id),
    onComplete: ({ question: q, raw, regenerated }) =>
      setHistory((h) => {
        const item = { question: q, answer: raw, askedAt: new Date().toISOString() };
        return regenerated && h[0]?.question === q ? [item, ...h.slice(1)] : [item, ...h];
      }),
  });
  const { current, parsed, status, busy, error } = answer;

  const ask = async (text = question) => {
    if (busy) return;
    if (await answer.ask(text, mode)) setQuestion("");
  };
  // Same question again, in the chosen length; replaces the previous answer in the session.
  const regenerate = (m: AnswerMode = mode) => {
    if (!current || busy) return;
    setMode(m);
    void answer.ask(current.question, m, true);
  };

  const newSession = () => {
    sessionRef.current = undefined;
    setHistory([]);
    answer.reset();
  };

  const previous = history.filter((h, i) => !(i === 0 && current && h.question === current.question));

  return (
    <>
      <PageHeader
        title="AI Interview"
        subtitle="Practise any question. Answers are suggestions built only from your profile, projects and job description: adapt them in your own words."
        actions={
          history.length > 0 && (
            <button type="button" onClick={newSession} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-haze hover:text-mist disabled:opacity-40">
              <MessageSquarePlus className="h-4 w-4" /> New session
            </button>
          )
        }
      />
      <div className="space-y-5 pb-12">
        {ctx && <ContextNote aiReady={ctx.aiReady} hasProfile={ctx.hasProfile} projectCount={ctx.projectCount} hasJobDescription={ctx.hasJobDescription} />}

        {/* Question */}
        <section className="glass rounded-3xl p-6">
          <label htmlFor="question" className="text-sm font-medium text-mist">Interview question</label>
          <textarea
            id="question"
            value={question}
            maxLength={1000}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void ask(); } }}
            placeholder="e.g. How did you make your WhatsApp invoice automation reliable?"
            className="mt-2 min-h-24 w-full resize-y rounded-2xl border border-white/10 bg-navy-800 px-4 py-3 text-[15px] text-mist outline-none placeholder:text-dim focus:border-electric/50"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <LengthPicker mode={mode} onChange={setMode} />
            <span className="hidden text-xs text-dim sm:inline">Ctrl + Enter to ask</span>
            <div className="ml-auto">
              {busy ? (
                <button type="button" onClick={() => void answer.cancel()} className="inline-flex items-center gap-2 rounded-xl bg-white/[0.08] px-5 py-2.5 text-sm font-semibold text-mist hover:bg-white/[0.12]">
                  <Square className="h-4 w-4" /> Stop
                </button>
              ) : (
                <button type="button" disabled={!ctx?.aiReady || question.trim().length < 3} onClick={() => void ask()} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-electric to-violet px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                  <Send className="h-4 w-4" /> Get answer
                </button>
              )}
            </div>
          </div>
          {!current && (
            <div className="mt-5 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button key={s} type="button" disabled={!ctx?.aiReady} onClick={() => void ask(s)} className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-sm text-haze hover:border-electric/30 hover:text-mist disabled:opacity-40">
                  {s}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Answer */}
        <AnimatePresence>
          {current && (
            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-3xl p-6" aria-live="polite">
              <p className="text-lg font-semibold text-mist" data-selectable>{current.question}</p>
              <div className="mt-2">
                <AnswerMeta questionType={parsed.questionType} confidence={parsed.confidence} firstWordsMs={current.firstWordsMs} totalMs={current.totalMs} />
              </div>
              <div className="mt-4 space-y-3">
                {status === "thinking" || (busy && !parsed.body) ? (
                  <p className="flex items-center gap-2 text-sm text-electric-soft"><Loader2 className="h-4 w-4 animate-spin" /> {stageText(answer.stage)}</p>
                ) : (
                  <Markdown text={parsed.body} streaming={status === "streaming"} />
                )}
                {!busy && <VerifyWarning confidence={parsed.confidence} />}
                {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
              </div>
              {!busy && (parsed.body || status === "error") && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
                  {parsed.body && <CopyButton text={parsed.body} />}
                  <RegenerateButton onClick={() => regenerate(current.mode)} />
                  <span className="ml-auto text-xs text-dim">Rewrite as</span>
                  <LengthPicker mode={current.mode} onChange={(m) => regenerate(m)} compact />
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Earlier in this session */}
        {previous.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-haze">Earlier in this session</h2>
            <div className="space-y-2">
              {previous.map((h) => <HistoryItem key={h.askedAt} item={h} />)}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function ContextNote({ aiReady, hasProfile, projectCount, hasJobDescription }: { aiReady: boolean; hasProfile: boolean; projectCount: number; hasJobDescription: boolean }) {
  if (!aiReady) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        <Info className="h-4 w-4 shrink-0" /> Connect an AI provider first. <Link to="/settings" className="underline underline-offset-4">Open Settings</Link>
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-haze">
      <Sparkles className="h-4 w-4 text-violet-soft" />
      {hasProfile
        ? `Using your profile, ${projectCount} ${projectCount === 1 ? "project" : "projects"}${hasJobDescription ? " and the job description" : ""}.`
        : "Answers will be generic: no profile yet."}
      {(!hasProfile || projectCount === 0) && (
        <Link to={hasProfile ? "/projects" : "/resume"} className="text-electric-soft underline-offset-4 hover:underline">
          {hasProfile ? "Add projects" : "Upload your resume"}
        </Link>
      )}
      {hasProfile && !hasJobDescription && (
        <Link to="/resume" className="text-electric-soft underline-offset-4 hover:underline">Add a job description</Link>
      )}
    </p>
  );
}

function HistoryItem({ item }: { item: SessionItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass rounded-2xl">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-sm text-mist">
        {item.question}
        <ChevronDown className={`h-4 w-4 shrink-0 text-dim transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-white/[0.06] px-5 py-4"><Markdown text={parseAnswer(item.answer).body} /></div>}
    </div>
  );
}
