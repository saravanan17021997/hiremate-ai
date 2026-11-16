// Projects (Phase 4): your project knowledge base. The AI uses it to answer questions about your work.
import { AnimatePresence, motion } from "framer-motion";
import { FileText, FolderKanban, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ExtractedProject, Project, ProjectInput, ProjectList } from "@shared/types";
import { projectDetailCount } from "@shared/projects";
import { PageHeader } from "../components/PageHeader";
import { useIpc } from "../lib/useIpc";

const input = "w-full rounded-xl border border-white/10 bg-navy-800 px-3 py-2.5 text-sm text-mist outline-none focus:border-electric/50";
const EMPTY: ProjectInput = { name: "", description: "", technologies: [], responsibilities: "", challenges: "", solutions: "", businessImpact: "" };

const FIELDS: { key: "description" | "responsibilities" | "challenges" | "solutions" | "businessImpact"; label: string; hint: string }[] = [
  { key: "description", label: "What it is", hint: "One or two sentences: what the project does and for whom." },
  { key: "responsibilities", label: "Your responsibilities", hint: "What YOU did: designed, built, led, maintained…" },
  { key: "challenges", label: "Challenges", hint: "The hard parts: scale, deadlines, messy data, legacy systems…" },
  { key: "solutions", label: "How you solved them", hint: "The approach and the decisions you made." },
  { key: "businessImpact", label: "Business impact", hint: "Real results with your own numbers: time saved, errors cut, users…" },
];

export function Projects() {
  const load = useCallback(() => window.hiremate.projects.list(), []);
  const { data, error: loadError, loading } = useIpc(load);
  const [list, setList] = useState<ProjectList | null>(null);
  const [editing, setEditing] = useState<ProjectInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setList(data), [data]);

  const save = async (p: ProjectInput) => {
    setBusy(true);
    setError(null);
    const r = await window.hiremate.projects.save(p);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setList(r.data);
    setEditing(null);
  };

  const remove = async (id: string) => {
    setBusy(true);
    const r = await window.hiremate.projects.delete(id);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setList(r.data);
    setEditing(null);
  };

  const importOne = (s: ExtractedProject) => save({ ...EMPTY, name: s.name, description: s.description, technologies: s.technologies });
  const importAll = async () => {
    for (const s of list?.suggestions ?? []) {
      const r = await window.hiremate.projects.save({ ...EMPTY, name: s.name, description: s.description, technologies: s.technologies });
      if (!r.ok) return setError(r.error);
      setList(r.data);
    }
  };

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Your project knowledge base. The more detail you add, the more specific and true your interview answers become."
        actions={
          <button type="button" onClick={() => { setError(null); setEditing({ ...EMPTY }); }} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-electric to-violet px-4 py-2.5 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> Add project
          </button>
        }
      />
      <div className="space-y-5 pb-12">
        {(loadError || (error && !editing)) && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{loadError ?? error}</p>}

        {list && list.suggestions.length > 0 && (
          <section className="glass rounded-3xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold text-mist"><FileText className="h-5 w-5 text-violet-soft" /> Found in your resume</h2>
              <button type="button" disabled={busy} onClick={() => void importAll()} className="text-sm text-electric-soft hover:underline disabled:opacity-40">Add all {list.suggestions.length}</button>
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {list.suggestions.map((s) => (
                <li key={s.name}>
                  <button type="button" disabled={busy} onClick={() => void importOne(s)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-mist hover:border-electric/40 disabled:opacity-40">
                    <Plus className="h-3.5 w-3.5 text-electric-soft" /> {s.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {loading && !list ? (
          <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-white/[0.04]" />)}</div>
        ) : list && list.projects.length === 0 ? (
          <div className="glass flex flex-col items-center rounded-3xl px-6 py-14 text-center">
            <FolderKanban className="h-10 w-10 text-dim" strokeWidth={1.4} />
            <p className="mt-3 font-medium text-mist">No projects yet</p>
            <p className="mt-1 max-w-md text-sm text-haze">Add the projects you'd talk about in an interview. Start with the one you're proudest of.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {list?.projects.map((p) => <ProjectCard key={p.id} project={p} onOpen={() => { setError(null); setEditing(p); }} />)}
          </div>
        )}
      </div>

      <AnimatePresence>
        {editing && <Editor project={editing} busy={busy} error={error} onSave={save} onDelete={remove} onClose={() => { setEditing(null); setError(null); }} />}
      </AnimatePresence>
    </>
  );
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const details = projectDetailCount(project);
  return (
    <button type="button" onClick={onOpen} className="glass group flex h-full flex-col rounded-3xl p-6 text-left transition-colors hover:border-electric/30">
      <div className="flex w-full items-start justify-between gap-3">
        <h3 className="font-semibold text-mist">{project.name}</h3>
        <span className={`shrink-0 text-xs ${details === 6 ? "text-success" : "text-dim"}`}>{details}/6 details</span>
      </div>
      {project.description && <p className="mt-2 line-clamp-2 text-sm text-haze">{project.description}</p>}
      {project.technologies.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
          {project.technologies.slice(0, 6).map((t) => <span key={t} className="rounded-lg bg-electric/10 px-2 py-0.5 text-xs text-electric-soft">{t}</span>)}
          {project.technologies.length > 6 && <span className="px-1 text-xs text-dim">+{project.technologies.length - 6}</span>}
        </div>
      )}
      {details < 4 && <p className="mt-3 flex items-center gap-1.5 text-xs text-violet-soft"><Sparkles className="h-3.5 w-3.5" /> Add challenges and impact for stronger answers</p>}
    </button>
  );
}

function Editor({ project, busy, error, onSave, onDelete, onClose }: {
  project: ProjectInput; busy: boolean; error: string | null; onSave: (p: ProjectInput) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const [p, setP] = useState<ProjectInput>(project);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setP((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30 flex justify-end bg-navy-950/70 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.aside
        role="dialog" aria-modal="true" aria-label={project.id ? "Edit project" : "Add project"}
        initial={{ x: 40 }} animate={{ x: 0 }} exit={{ x: 40 }} transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-navy-900 p-7"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-mist">{project.id ? "Edit project" : "Add project"}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-dim hover:bg-white/[0.05] hover:text-mist"><X className="h-5 w-5" /></button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); onSave(p); }}>
          <label className="block text-sm text-haze">
            <span className="mb-1.5 block">Project name</span>
            <input className={input} required maxLength={200} value={p.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          </label>
          <label className="block text-sm text-haze">
            <span className="mb-1.5 block">Technologies</span>
            <TagInput value={p.technologies} onChange={(v) => set("technologies", v)} />
          </label>
          {FIELDS.map((f) => (
            <label key={f.key} className="block text-sm text-haze">
              <span className="mb-1 block">{f.label}</span>
              <span className="mb-1.5 block text-xs text-dim">{f.hint}</span>
              <textarea className={`${input} min-h-20`} maxLength={4000} value={p[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            </label>
          ))}

          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" disabled={busy || !p.name.trim()} className="inline-flex items-center gap-2 rounded-xl bg-mist px-5 py-2.5 text-sm font-semibold text-navy-900 hover:bg-white disabled:opacity-40">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save project
            </button>
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-haze hover:bg-white/[0.05]">Cancel</button>
            {project.id && (
              <span className="ml-auto">
                {confirmDelete ? (
                  <span className="inline-flex items-center gap-2 text-sm text-rose-200">
                    Delete this project?
                    <button type="button" disabled={busy} onClick={() => onDelete(project.id!)} className="rounded-lg bg-rose-500/20 px-3 py-1.5 font-medium hover:bg-rose-500/30">Delete</button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg px-2 py-1.5 text-haze hover:text-mist">Keep</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm text-haze hover:bg-white/[0.05] hover:text-rose-200">
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                )}
              </span>
            )}
          </div>
        </form>
      </motion.aside>
    </motion.div>
  );
}

/** Technologies as removable chips; type and press Enter or comma to add. */
function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const items = text.split(",").map((s) => s.trim()).filter((s) => s && !value.some((v) => v.toLowerCase() === s.toLowerCase()));
    if (items.length) onChange([...value, ...items].slice(0, 60));
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
        value={text} maxLength={60} placeholder={value.length ? "" : "e.g. React, Supabase, n8n"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={add}
        className="min-w-24 flex-1 bg-transparent px-1 py-1 text-sm text-mist outline-none placeholder:text-dim"
      />
    </div>
  );
}
