// My Resume (Phase 3): upload a resume, let the AI draft your profile, review and edit it, then save.
import { AnimatePresence, motion } from "framer-motion";
import { Briefcase, CheckCircle2, FileUp, FolderKanban, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CandidateProfile, JobDescription, ResumeImport, SavedProfile } from "@shared/types";
import { profileCompletion } from "@shared/profile";
import { PageHeader } from "../components/PageHeader";
import { useIpc } from "../lib/useIpc";

const EMPTY: CandidateProfile = {
  fullName: "", professionalSummary: "", totalExperienceYears: null, currentDesignation: "",
  technicalSkills: [], education: [], employment: [], achievements: [],
};

const input = "w-full rounded-xl border border-white/10 bg-navy-800 px-3 py-2.5 text-sm text-mist outline-none focus:border-electric/50";

export function MyResume() {
  const getProfile = useCallback(() => window.hiremate.profile.get(), []);
  const getAi = useCallback(() => window.hiremate.ai.getSettings(), []);
  const { data: saved, error: loadError } = useIpc(getProfile);
  const { data: ai } = useIpc(getAi);
  const aiReady = Boolean(ai?.activeProvider && ai.activeModel);

  const [profile, setProfile] = useState<CandidateProfile>(EMPTY);
  const [savedInfo, setSavedInfo] = useState<SavedProfile | null>(null);
  const [draft, setDraft] = useState<ResumeImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (saved) {
      setSavedInfo(saved);
      if (saved.profile) setProfile(saved.profile);
    }
  }, [saved]);

  const upload = async () => {
    setImporting(true);
    setError(null);
    setNotice(null);
    const r = await window.hiremate.resume.import();
    setImporting(false);
    if (!r.ok) return setError(r.error);
    if (!r.data) return; // picker cancelled
    setDraft(r.data);
    setProfile(r.data.profile);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const r = await window.hiremate.profile.save(profile, draft?.importId);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    setSavedInfo(r.data);
    setDraft(null);
    setNotice(r.data.savedTo === "supabase" ? "Saved to your account and this PC." : "Saved on this PC.");
  };

  const set = <K extends keyof CandidateProfile>(key: K, value: CandidateProfile[K]) => setProfile((p) => ({ ...p, [key]: value }));
  const completion = profileCompletion(profile);

  return (
    <>
      <PageHeader title="My Resume" subtitle="Upload your resume once. The AI drafts your profile; you check it before anything is saved." />
      <div className="space-y-5 pb-12">
        {/* Upload */}
        <section className="glass flex flex-wrap items-center gap-5 rounded-3xl p-7">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-electric/15 text-electric-soft">
            {importing ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileUp className="h-6 w-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-mist">{importing ? "Reading your resume…" : "Upload a resume"}</p>
            <p className="text-sm text-haze">
              {importing
                ? "Checking the file, extracting the text, then the AI drafts your profile. This takes up to a minute."
                : savedInfo?.resumeFileName
                  ? `Last used: ${savedInfo.resumeFileName}${savedInfo.resumeParsedAt ? ` · ${new Date(savedInfo.resumeParsedAt).toLocaleDateString()}` : ""}`
                  : "PDF or Word (.docx), up to 10 MB. Scanned images can't be read."}
            </p>
          </div>
          <button
            type="button"
            disabled={!aiReady || importing}
            onClick={() => void upload()}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-electric to-violet px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileUp className="h-4 w-4" /> Choose file
          </button>
          {!aiReady && ai && (
            <p className="w-full text-sm text-haze">
              Reading a resume needs an AI provider. <Link to="/settings" className="text-electric-soft underline-offset-4 hover:underline">Connect one in Settings</Link>
            </p>
          )}
        </section>

        <JobDescriptionCard />

        {(error || loadError) && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error ?? loadError}</p>}

        <AnimatePresence>
          {draft && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-2 rounded-xl border border-violet/30 bg-violet/10 px-4 py-3 text-sm text-violet-soft">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              Draft from {draft.fileName} ({draft.model}). Check every field: fix anything wrong, fill gaps, then save. Nothing is saved yet.
            </motion.p>
          )}
        </AnimatePresence>

        {/* Profile editor */}
        <section className="glass rounded-3xl p-7" aria-labelledby="profile-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="profile-title" className="text-lg font-semibold text-mist">My profile</h2>
            <span className="text-sm text-haze">{completion}% complete</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-electric to-violet" animate={{ width: `${completion}%` }} />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Full name"><input className={input} value={profile.fullName} maxLength={120} onChange={(e) => set("fullName", e.target.value)} /></Field>
            <Field label="Current designation"><input className={input} value={profile.currentDesignation} maxLength={120} onChange={(e) => set("currentDesignation", e.target.value)} /></Field>
            <Field label="Total experience (years)">
              <input
                className={input} type="number" min={0} max={60} step={0.5}
                value={profile.totalExperienceYears ?? ""}
                onChange={(e) => set("totalExperienceYears", e.target.value === "" ? null : Math.min(60, Math.max(0, Number(e.target.value))))}
              />
            </Field>
            <Field label="Technical skills"><SkillsInput value={profile.technicalSkills} onChange={(v) => set("technicalSkills", v)} /></Field>
            <Field label="Professional summary" wide>
              <textarea className={`${input} min-h-28`} value={profile.professionalSummary} maxLength={4000} onChange={(e) => set("professionalSummary", e.target.value)} />
            </Field>
          </div>

          <Rows
            title="Experience" addLabel="Add role" rows={profile.employment} empty={{ role: "", company: "", years: "" }}
            fields={[["role", "Role"], ["company", "Company"], ["years", "Years"]]} onChange={(v) => set("employment", v)}
          />
          <Rows
            title="Education" addLabel="Add education" rows={profile.education} empty={{ degree: "", institution: "", years: "" }}
            fields={[["degree", "Degree"], ["institution", "Institution"], ["years", "Years"]]} onChange={(v) => set("education", v)}
          />
          <ListInput title="Achievements" addLabel="Add achievement" value={profile.achievements} onChange={(v) => set("achievements", v)} />

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-mist px-5 py-2.5 text-sm font-semibold text-navy-900 hover:bg-white disabled:opacity-40">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save profile
            </button>
            {notice && <span className="inline-flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> {notice}</span>}
          </div>
        </section>

        {draft && draft.projects.length > 0 && (
          <section className="glass rounded-3xl p-7">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-mist"><FolderKanban className="h-5 w-5 text-electric-soft" /> Projects found in your resume</h2>
            <p className="mt-1 text-sm text-haze">After you save, add them on the <Link to="/projects" className="text-electric-soft underline-offset-4 hover:underline">Projects</Link> page and fill in the details.</p>
            <ul className="mt-4 space-y-2">
              {draft.projects.map((p) => (
                <li key={p.name} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm">
                  <span className="font-medium text-mist">{p.name}</span>
                  {p.technologies.length > 0 && <span className="text-dim"> · {p.technologies.join(", ")}</span>}
                  {p.description && <p className="mt-1 text-haze">{p.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`block text-sm text-haze ${wide ? "md:col-span-2" : ""}`}><span className="mb-1.5 block">{label}</span>{children}</label>;
}

/** Skills as removable chips; type and press Enter or comma to add. */
function SkillsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const items = text.split(",").map((s) => s.trim()).filter((s) => s && !value.some((v) => v.toLowerCase() === s.toLowerCase()));
    if (items.length) onChange([...value, ...items].slice(0, 100));
    setText("");
  };
  return (
    <div className="flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-navy-800 px-2 py-1.5 focus-within:border-electric/50">
      {value.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 rounded-lg bg-electric/15 px-2 py-1 text-xs text-electric-soft">
          {s}
          <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(value.filter((v) => v !== s))}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input
        value={text} maxLength={60} placeholder={value.length ? "" : "Type a skill, press Enter"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={add}
        className="min-w-24 flex-1 bg-transparent px-1 py-1 text-sm text-mist outline-none placeholder:text-dim"
      />
    </div>
  );
}

/** Editable rows (experience, education). */
function Rows<T extends Record<string, string>>({ title, addLabel, rows, empty, fields, onChange }: {
  title: string; addLabel: string; rows: T[]; empty: T; fields: [keyof T & string, string][]; onChange: (rows: T[]) => void;
}) {
  const update = (i: number, key: keyof T, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  return (
    <div className="mt-7">
      <h3 className="text-sm font-semibold text-mist">{title}</h3>
      <div className="mt-2 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-[1.4fr_1.4fr_0.8fr_auto]">
            {fields.map(([key, label]) => (
              <input key={key} aria-label={label} placeholder={label} maxLength={200} className={input} value={r[key]} onChange={(e) => update(i, key, e.target.value)} />
            ))}
            <button type="button" aria-label={`Remove ${title} row`} onClick={() => onChange(rows.filter((_, j) => j !== i))} className="rounded-xl px-3 text-dim hover:bg-white/[0.05] hover:text-mist"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...rows, { ...empty }])} className="mt-2 inline-flex items-center gap-1.5 text-sm text-electric-soft hover:underline"><Plus className="h-4 w-4" /> {addLabel}</button>
    </div>
  );
}

/** Editable list of single lines (achievements). */
function ListInput({ title, addLabel, value, onChange }: { title: string; addLabel: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="mt-7">
      <h3 className="text-sm font-semibold text-mist">{title}</h3>
      <div className="mt-2 space-y-2">
        {value.map((a, i) => (
          <div key={i} className="flex gap-2">
            <input aria-label={`${title} ${i + 1}`} maxLength={500} className={input} value={a} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded-xl px-3 text-dim hover:bg-white/[0.05] hover:text-mist"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...value, ""])} className="mt-2 inline-flex items-center gap-1.5 text-sm text-electric-soft hover:underline"><Plus className="h-4 w-4" /> {addLabel}</button>
    </div>
  );
}

/** The job you're preparing for. Used as context for answers; never treated as your own experience. */
function JobDescriptionCard() {
  const getJd = useCallback(() => window.hiremate.jobDescription.get(), []);
  const { data } = useIpc(getJd);
  const [jd, setJd] = useState<JobDescription | null>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    if (data !== undefined) setJd(data);
  }, [data]);

  const upload = async () => {
    setBusy("upload");
    setError(null);
    const r = await window.hiremate.jobDescription.import();
    setBusy(null);
    if (!r.ok) return setError(r.error);
    if (r.data) setJd(r.data);
  };
  const remove = async () => {
    setBusy("remove");
    setError(null);
    const r = await window.hiremate.jobDescription.clear();
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setJd(null);
    setShowText(false);
  };

  return (
    <section className="glass rounded-3xl p-7" aria-labelledby="jd-title">
      <div className="flex flex-wrap items-center gap-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet/15 text-violet-soft">
          {busy === "upload" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Briefcase className="h-6 w-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="jd-title" className="font-semibold text-mist">Job description</h2>
          <p className="text-sm text-haze">
            {jd
              ? `${jd.fileName} · added ${new Date(jd.uploadedAt).toLocaleDateString()} · ${jd.text.length.toLocaleString()} characters`
              : "Optional. Upload the job you're applying for (PDF or .docx) so answers focus on what it asks for. Answers still only use your real experience."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {jd && (
            <button type="button" disabled={busy !== null} onClick={() => void remove()} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-haze hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-40">
              {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove
            </button>
          )}
          <button type="button" disabled={busy !== null} onClick={() => void upload()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-mist hover:bg-white/[0.05] disabled:opacity-40">
            <FileUp className="h-4 w-4" /> {jd ? "Replace" : "Upload job description"}
          </button>
        </div>
      </div>
      {jd && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowText((v) => !v)} className="text-sm text-electric-soft underline-offset-4 hover:underline">
            {showText ? "Hide extracted text" : "Show extracted text"}
          </button>
          {showText && <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-navy-950/60 p-4 font-sans text-xs text-haze" data-selectable>{jd.text}</pre>}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    </section>
  );
}
