// Dashboard: real numbers from the main process. A new user sees zeros and a setup checklist, never sample data.
import { motion } from "framer-motion";
import {
  ArrowRight, CheckCircle2, Circle, Cloud, FileText, HardDrive, FolderKanban, KeyRound, ListChecks, MessagesSquare, MicOff, RefreshCw, ShieldCheck, Sparkles, UserRound,
  type LucideIcon,
} from "lucide-react";
import { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { DashboardSummary, SessionSummary } from "@shared/types";
import { PageHeader } from "../components/PageHeader";
import { useIpc } from "../lib/useIpc";

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] },
});

export function Dashboard() {
  const getSummary = useCallback(() => window.hiremate.dashboard.getSummary(), []);
  const { data, error, loading, reload } = useIpc(getSummary);

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div role="alert" className="glass max-w-xl rounded-2xl p-6">
          <p className="font-medium text-mist">Couldn't load your dashboard</p>
          <p className="mt-1 text-sm text-haze">{error}</p>
          <button type="button" onClick={() => void reload()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/[0.06] px-4 py-2 text-sm text-mist hover:bg-white/[0.1]">
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      </>
    );
  }

  if (loading || !data) return <DashboardSkeleton />;

  return (
    <>
      <PageHeader
        title={data.candidateName ? `Welcome back, ${data.candidateName.split(" ")[0]}` : "Welcome to HireMate AI"}
        subtitle="Prepare with answers grounded in your own resume, experience and projects."
        actions={
          <Link to="/settings" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-haze hover:text-mist">
            {data.dataSource === "supabase" ? <Cloud className="h-3.5 w-3.5 text-success" /> : <HardDrive className="h-3.5 w-3.5" />}
            {data.dataSource === "supabase" ? "Synced to your account" : "Saved on this PC"}
          </Link>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <motion.div {...rise(0)}>
          <ReadinessPanel summary={data} />
        </motion.div>
        <motion.div {...rise(0.06)}>
          <QuickStart aiReady={data.setup.aiProvider} />
        </motion.div>
      </div>

      <motion.div {...rise(0.12)} className="mt-5 grid grid-cols-2 gap-5 lg:grid-cols-4">
        <Stat icon={ListChecks} label="Practice sessions" value={data.stats.sessions} />
        <Stat icon={Sparkles} label="Questions answered" value={data.stats.questionsAnswered} />
        <Stat icon={MessagesSquare} label="Mock interviews" value={data.stats.mockInterviews} />
        <Stat icon={UserRound} label="Profile complete" value={`${data.stats.resumeCompletion}%`} />
      </motion.div>

      <div className="mt-5 grid gap-5 pb-10 xl:grid-cols-[1.35fr_1fr]">
        <motion.div {...rise(0.18)}>
          <RecentSessions sessions={data.recentSessions} />
        </motion.div>
        <motion.div {...rise(0.22)}>
          <PrivacyPanel />
        </motion.div>
      </div>
    </>
  );
}

/* ---------- Readiness: setup checklist with a progress ring ---------- */

const SETUP_STEPS: { key: keyof DashboardSummary["setup"]; label: string; hint: string; to: string; icon: LucideIcon }[] = [
  { key: "aiProvider", label: "Connect an AI provider", hint: typeof window !== "undefined" && window.hiremate?.platform === "web" ? "Set up by the owner" : "Free Gemini or Groq key works", to: "/settings", icon: KeyRound },
  { key: "resume", label: "Upload your resume", hint: "PDF or DOCX", to: "/resume", icon: FileText },
  { key: "profile", label: "Complete your profile", hint: "Review what was extracted", to: "/resume", icon: UserRound },
  { key: "projects", label: "Add your projects", hint: "So answers use real examples", to: "/projects", icon: FolderKanban },
];

function ReadinessPanel({ summary }: { summary: DashboardSummary }) {
  const done = SETUP_STEPS.filter((s) => summary.setup[s.key]).length;
  return (
    <section className="glass relative h-full overflow-hidden rounded-3xl p-7" aria-labelledby="readiness-title">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-electric/20 blur-3xl" />
      <div className="relative flex items-center gap-6">
        <ProgressRing value={done / SETUP_STEPS.length} label={`${done}/${SETUP_STEPS.length}`} />
        <div>
          <h2 id="readiness-title" className="text-lg font-semibold text-mist">
            {done === SETUP_STEPS.length ? "You're ready to practise" : "Get interview-ready"}
          </h2>
          <p className="mt-1 text-sm text-haze">
            {done === SETUP_STEPS.length
              ? "Every answer will draw on your profile and projects."
              : "Each step gives the AI more of your real experience to work with."}
          </p>
        </div>
      </div>
      <ul className="relative mt-6 grid gap-2 sm:grid-cols-2">
        {SETUP_STEPS.map(({ key, label, hint, to, icon: Icon }) => {
          const complete = summary.setup[key];
          return (
            <li key={key}>
              <Link
                to={to}
                className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition-colors hover:border-electric/30 hover:bg-white/[0.04]"
              >
                <Icon className="h-[18px] w-[18px] shrink-0 text-haze" strokeWidth={1.8} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium ${complete ? "text-haze line-through decoration-dim" : "text-mist"}`}>{label}</span>
                  <span className="block truncate text-xs text-dim">{hint}</span>
                </span>
                {complete ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Done" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-dim group-hover:text-electric-soft" aria-label="Not done" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4f8cff" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="8" />
        <motion.circle
          cx="44" cy="44" r={r} fill="none" stroke="url(#ring-g)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums text-mist">{label}</span>
        <span className="text-[11px] text-dim">steps</span>
      </span>
    </div>
  );
}

/* ---------- Quick start ---------- */

function QuickStart({ aiReady }: { aiReady: boolean }) {
  const navigate = useNavigate();
  return (
    <section className="relative h-full overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-electric/25 via-navy-700/70 to-violet/25 p-7">
      <MessagesSquare className="absolute -bottom-6 -right-6 h-40 w-40 text-white/[0.04]" strokeWidth={1.2} />
      <h2 className="text-lg font-semibold text-mist">Quick-start mock interview</h2>
      <p className="mt-1 max-w-sm text-sm text-haze">
        Pick a role and level, answer questions one at a time, and get feedback on each answer.
      </p>
      <button
        type="button"
        disabled={!aiReady}
        onClick={() => navigate("/mock-interview")}
        className="relative mt-6 inline-flex items-center gap-2 rounded-xl bg-mist px-5 py-3 text-sm font-semibold text-navy-900 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-dim"
      >
        Start mock interview <ArrowRight className="h-4 w-4" />
      </button>
      {!aiReady && (
        <p className="relative mt-3 text-xs text-haze">
          Needs an AI provider.{" "}
          <Link to="/settings" className="text-electric-soft underline-offset-4 hover:underline">
            Connect one in Settings
          </Link>
        </p>
      )}
    </section>
  );
}

/* ---------- Stats ---------- */

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | string }) {
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <div className="flex items-center gap-2 text-sm text-haze">
        <Icon className="h-4 w-4 text-electric-soft" strokeWidth={1.8} />
        {label}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-mist">{value}</p>
    </div>
  );
}

/* ---------- Recent sessions ---------- */

function RecentSessions({ sessions }: { sessions: SessionSummary[] }) {
  return (
    <section className="glass h-full rounded-3xl p-7" aria-labelledby="recent-title">
      <div className="flex items-center justify-between">
        <h2 id="recent-title" className="text-lg font-semibold text-mist">Recent sessions</h2>
        {sessions.length > 0 && (
          <Link to="/history" className="text-sm text-electric-soft underline-offset-4 hover:underline">View all</Link>
        )}
      </div>
      {sessions.length === 0 ? (
        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-dashed border-white/10 p-6">
          <ListChecks className="h-8 w-8 shrink-0 text-dim" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-medium text-mist">No sessions yet</p>
            <p className="text-sm text-haze">Your AI Interview and mock interview sessions will be listed here.</p>
          </div>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-white/[0.06]">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-4 py-3">
              {s.kind === "mock" ? <MessagesSquare className="h-5 w-5 text-violet-soft" /> : <Sparkles className="h-5 w-5 text-electric-soft" />}
              <span className="min-w-0 flex-1 truncate text-sm text-mist">{s.title}</span>
              <span className="text-xs tabular-nums text-dim">
                {s.questionCount} {s.questionCount === 1 ? "question" : "questions"} · {new Date(s.startedAt).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Privacy ---------- */

function PrivacyPanel() {
  const getInfo = useCallback(() => window.hiremate.app.getInfo(), []);
  const { data: info } = useIpc(getInfo);
  return (
    <section className="glass h-full rounded-3xl p-7" aria-labelledby="privacy-title">
      <h2 id="privacy-title" className="flex items-center gap-2 text-lg font-semibold text-mist">
        <ShieldCheck className="h-5 w-5 text-success" /> Privacy
      </h2>
      <ul className="mt-4 space-y-4 text-sm">
        <li className="flex gap-3">
          <MicOff className="mt-0.5 h-4 w-4 shrink-0 text-haze" />
          <span className="text-haze">
            <span className="font-medium text-mist">Not listening.</span> HireMate only hears audio during a Live Assistant session that you
            start after confirming consent. Meeting audio is never saved.
          </span>
        </li>
        <li className="flex gap-3">
          <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-haze" />
          <span className="min-w-0 text-haze">
            {window.hiremate.platform === "web" ? (
              <><span className="font-medium text-mist">Your data is in your own account.</span> Only you can see it; other users of this site can't.</>
            ) : (
              <><span className="font-medium text-mist">Your data stays on this PC</span> until you sign in to sync it.</>
            )}
            {info && (
              <span data-selectable className="mt-1 block truncate text-xs text-dim" title={info.dataLocation}>
                {info.dataLocation}
              </span>
            )}
          </span>
        </li>
      </ul>
    </section>
  );
}

/* ---------- Loading ---------- */

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="animate-pulse pt-12">
      <div className="h-8 w-72 rounded-lg bg-white/[0.06]" />
      <div className="mt-3 h-4 w-96 rounded bg-white/[0.04]" />
      <div className="mt-8 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="h-64 rounded-3xl bg-white/[0.04]" />
        <div className="h-64 rounded-3xl bg-white/[0.04]" />
      </div>
    </div>
  );
}
