// The web version of window.hiremate. Same interface as the desktop app's, so every screen works unchanged:
//  - your data (profile, projects, history, job description) goes to Supabase as your own rows;
//  - AI, transcription and document reading go to this site's /api functions, which hold the owner's key.
import { z } from "zod";
import type { HireMateApi } from "@shared/api";
import type { IpcResult } from "@shared/ipc";
import type {
  AccountStatus, AiSettings, AnswerMode, CandidateProfile, ExtractedProject, JobDescription, LiveConsent, Project, ProjectInput,
  ProjectList, ResumeImport, SavedProfile, SessionRecord, StreamEvent, Transcript,
} from "@shared/types";
import { mapRemoteSummary, profileFromRow } from "../main/data/remoteSummary";
import { profileSchema } from "../main/resume/schema";
import { configProblem, supabase } from "./supabase";
import { pickFile } from "./pickFile";
import { closePanel, openPanel, panelBus } from "./pip";

import { APP_NAME } from "@shared/brand";

declare const __APP_VERSION__: string;

const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data });
const fail = (e: unknown): IpcResult<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const wrap = <T>(fn: () => Promise<T>): Promise<IpcResult<T>> => {
  try {
    return fn().then(ok, fail); // fn runs straight away, so file pickers and pop-ups keep the click
  } catch (e) {
    return Promise.resolve(fail(e));
  }
};

const MAX_UPLOAD = 4 * 1024 * 1024; // the hosting limit for one request is 4.5 MB
const MAX_JD_CHARS = 12_000;

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error("Please sign in again.");
  return t;
}

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Please sign in again.");
  return id;
}

/** Calls this site's server functions with the sign-in token. */
async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await token()}` } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `The server couldn't do that (error ${res.status}).`);
  }
  return res;
}

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

// ---------- Who's signed in, and the server's AI ----------

let me: Promise<{ email: string; model: string; aiReady: boolean }> | null = null;
export function loadMe(force = false) {
  if (!me || force) me = api("/api/me").then((r) => r.json());
  me.catch(() => (me = null));
  return me;
}

// ---------- Streaming answers ----------

const streamListeners = new Set<(e: StreamEvent) => void>();
const emit = (e: StreamEvent) => streamListeners.forEach((l) => l(e));
const running = new Map<string, AbortController>();

/** Starts /api/ask and turns its event stream into StreamEvents. Resolves once the server has accepted the question. */
async function startStream(body: Record<string, unknown>, requestId: string) {
  const controller = new AbortController();
  running.set(requestId, controller);
  let res: Response;
  try {
    res = await api("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, requestId }), signal: controller.signal });
  } catch (e) {
    running.delete(requestId);
    if ((e as Error).name === "AbortError") return emit({ requestId, type: "done" });
    throw e;
  }
  void (async () => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          for (const line of block.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const e = JSON.parse(line.slice(6)) as StreamEvent;
            if (e.type === "done" || e.type === "error") finished = true;
            emit(e);
          }
        }
      }
      if (!finished) emit({ requestId, type: "error", error: "The connection to the server was cut off. Press Regenerate." });
    } catch (e) {
      emit((e as Error).name === "AbortError" ? { requestId, type: "done" } : { requestId, type: "error", error: "The connection to the server was cut off. Press Regenerate." });
    } finally {
      running.delete(requestId);
    }
  })();
}

// ---------- Uploads waiting to be saved ----------

type PendingResume = { fileName: string; fileType: "pdf" | "docx"; fileSize: number; text: string; extraction: { profile: CandidateProfile; projects: ExtractedProject[] } };
const imports = new Map<string, PendingResume>();

async function upload(purpose: "resume" | "jd", file: File) {
  if (file.size > MAX_UPLOAD) throw new Error(`This file is ${(file.size / 1048576).toFixed(1)} MB. The web version accepts files up to 4 MB.`);
  const res = await api(`/api/extract?purpose=${purpose}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
    body: file,
  });
  return res.json();
}

// ---------- Data (each user only ever sees their own rows: row-level security) ----------

type ProjectRow = { id: string; name: string; description: string; technologies: string[] | null; responsibilities: string; challenges: string; solutions: string; business_impact: string; updated_at: string };
const projectFromRow = (r: ProjectRow): Project => ({
  id: r.id, name: r.name, description: r.description, technologies: r.technologies ?? [], responsibilities: r.responsibilities,
  challenges: r.challenges, solutions: r.solutions, businessImpact: r.business_impact, updatedAt: r.updated_at,
});
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function latestResume() {
  const r = await supabase.from("resumes").select("file_name, parsed_at, extraction").order("created_at", { ascending: false }).limit(1);
  return (r.data?.[0] ?? null) as { file_name: string; parsed_at: string | null; extraction: { projects?: ExtractedProject[] } | null } | null;
}

async function getProfile(): Promise<SavedProfile> {
  const uid = await userId();
  const [p, resume] = await Promise.all([supabase.from("profiles").select("*").eq("user_id", uid).maybeSingle(), latestResume()]);
  return { profile: profileFromRow(check(p, "Couldn't load your profile") as never), resumeFileName: resume?.file_name ?? null, resumeParsedAt: resume?.parsed_at ?? null, savedTo: "supabase" };
}

async function listProjects(): Promise<ProjectList> {
  const [rows, resume] = await Promise.all([supabase.from("projects").select("*").order("updated_at", { ascending: false }), latestResume()]);
  const projects = (check(rows, "Couldn't load your projects") as ProjectRow[]).map(projectFromRow);
  const found = Array.isArray(resume?.extraction?.projects) ? resume!.extraction!.projects! : [];
  return { projects, suggestions: found.filter((s) => !projects.some((p) => sameName(p.name, s.name))), savedTo: "supabase" };
}

const field = (max: number) => z.string().trim().max(max);
const projectInput = z.object({
  id: z.string().uuid().optional(),
  name: field(200).min(1, "Give the project a name."),
  description: field(4000), responsibilities: field(4000), challenges: field(4000), solutions: field(4000), businessImpact: field(4000),
  technologies: z.array(field(60)).max(60).transform((a) => [...new Set(a.filter(Boolean))]),
});

async function getJd(): Promise<JobDescription | null> {
  const r = await supabase.from("job_descriptions").select("file_name, text, created_at").order("created_at", { ascending: false }).limit(1);
  const row = check(r, "Couldn't load the job description")?.[0] as { file_name: string; text: string; created_at: string } | undefined;
  return row ? { fileName: row.file_name, text: row.text, uploadedAt: row.created_at } : null;
}

async function listSessions(): Promise<SessionRecord[]> {
  const r = await supabase
    .from("sessions")
    .select("id, kind, title, started_at, consent_organisation, consent_permission, consent_at, session_items(question, suggested_answer, created_at, position)")
    .order("started_at", { ascending: false });
  type Row = { id: string; kind: SessionRecord["kind"]; title: string; started_at: string; consent_organisation: string | null; consent_permission: string | null; consent_at: string | null; session_items: { question: string; suggested_answer: string | null; created_at: string; position: number }[] };
  return (check(r, "Couldn't load your sessions") as Row[]).map((s) => ({
    id: s.id,
    kind: s.kind,
    title: s.title,
    startedAt: s.started_at,
    ...(s.consent_organisation && s.consent_permission && s.consent_at ? { consent: { organisation: s.consent_organisation, permission: s.consent_permission, confirmedAt: s.consent_at } } : {}),
    questions: [...(s.session_items ?? [])].sort((a, b) => a.position - b.position).map((i) => ({ question: i.question, answer: i.suggested_answer ?? "", askedAt: i.created_at })),
  }));
}

async function newSession(kind: "workspace" | "live", title: string, consent?: LiveConsent) {
  const t = title.length > 80 ? `${title.slice(0, 77)}…` : title;
  const now = new Date().toISOString();
  const r = await supabase
    .from("sessions")
    .insert({ kind, title: t, ...(consent ? { consent_organisation: consent.organisation, consent_permission: consent.permission, consent_at: now } : {}) })
    .select("id")
    .single();
  return (check(r, "Couldn't start the session") as { id: string }).id;
}

const knownSessions = new Set<string>();
let live: { sessionId: string; notes: string | null } | null = null;

// ---------- The API ----------

export function createWebApi(): HireMateApi {
  return {
    platform: "web",
    app: {
      getInfo: () => wrap(async () => ({ name: APP_NAME, version: __APP_VERSION__, platform: "web", dataLocation: "Your HireMate account (Supabase)" })),
      openExternal: (url) => wrap(async () => Boolean(window.open(url, "_blank", "noopener,noreferrer"))),
    },
    dashboard: {
      getSummary: () => wrap(async () => {
        const [raw, info] = await Promise.all([supabase.rpc("dashboard_summary"), loadMe().catch(() => null)]);
        return mapRemoteSummary(check(raw, "Couldn't load the dashboard"), Boolean(info?.aiReady));
      }),
    },
    ai: {
      getSettings: () => wrap(async (): Promise<AiSettings> => {
        const info = await loadMe();
        return { providers: [], activeProvider: "groq", activeModel: info.model, encryptionAvailable: true, managed: { label: "Groq", model: info.model } };
      }),
      saveKey: () => Promise.resolve(fail(new Error("The web version uses the owner's AI key, so there's nothing to enter here."))),
      removeKey: () => Promise.resolve(fail(new Error("The web version uses the owner's AI key."))),
      setActive: () => Promise.resolve(fail(new Error("The web version uses the owner's AI key."))),
      startTest: (prompt) => wrap(async () => {
        const requestId = crypto.randomUUID();
        await startStream({ test: prompt }, requestId);
        return { requestId };
      }),
      cancel: (requestId) => wrap(async () => {
        running.get(requestId)?.abort();
        return true;
      }),
      onStream: (listener) => {
        streamListeners.add(listener);
        return () => void streamListeners.delete(listener);
      },
    },
    account: {
      getStatus: () => wrap(async (): Promise<AccountStatus> => {
        const { data } = await supabase.auth.getSession();
        return { configured: !configProblem, signedIn: Boolean(data.session), email: data.session?.user.email ?? null, sessionPersisted: true, configProblem };
      }),
      signUp: (email, password) => wrap(async () => {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw new Error(error.message);
        return { status: { configured: true, signedIn: Boolean(data.session), email, sessionPersisted: true, configProblem: null }, needsEmailConfirmation: !data.session };
      }),
      signIn: (email, password) => wrap(async () => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
        loadMe(true);
        return { configured: true, signedIn: true, email: data.user.email ?? email, sessionPersisted: true, configProblem: null };
      }),
      signOut: () => wrap(async () => {
        await supabase.auth.signOut();
        me = null;
        return { configured: true, signedIn: false, email: null, sessionPersisted: true, configProblem: null };
      }),
    },
    resume: {
      import: () => wrap(async (): Promise<ResumeImport | null> => {
        const file = await pickFile(".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        if (!file) return null;
        const r = (await upload("resume", file)) as PendingResume & { profile: CandidateProfile; projects: ExtractedProject[]; model: string; textLength: number };
        const importId = crypto.randomUUID();
        imports.clear();
        imports.set(importId, { fileName: r.fileName, fileType: r.fileType, fileSize: r.fileSize, text: r.text, extraction: { profile: r.profile, projects: r.projects } });
        return { importId, fileName: r.fileName, fileType: r.fileType, fileSize: r.fileSize, textLength: r.textLength, profile: r.profile, projects: r.projects, model: r.model };
      }),
    },
    profile: {
      get: () => wrap(getProfile),
      save: (input, importId) => wrap(async () => {
        const profile = profileSchema.parse(input) as CandidateProfile;
        const pending = importId ? imports.get(importId) : undefined;
        if (importId && !pending) throw new Error("That upload has expired. Upload the resume again.");
        const uid = await userId();
        check(
          await supabase.from("profiles").upsert({
            user_id: uid, full_name: profile.fullName, professional_summary: profile.professionalSummary, total_experience_years: profile.totalExperienceYears,
            current_designation: profile.currentDesignation, technical_skills: profile.technicalSkills, education: profile.education, employment: profile.employment, achievements: profile.achievements,
          }, { onConflict: "user_id" }),
          "Couldn't save your profile",
        );
        if (pending) {
          check(
            await supabase.from("resumes").insert({
              file_name: pending.fileName, file_type: pending.fileType, file_size: pending.fileSize, extracted_text: pending.text, extraction: pending.extraction, parsed_at: new Date().toISOString(),
            }),
            "Profile saved, but the resume record wasn't",
          );
          imports.delete(importId!);
        }
        return getProfile();
      }),
    },
    projects: {
      list: () => wrap(listProjects),
      save: (input: ProjectInput) => wrap(async () => {
        const p = projectInput.parse(input);
        const { projects } = await listProjects();
        const duplicate = projects.find((x) => x.id !== p.id && sameName(x.name, p.name));
        if (duplicate) throw new Error(`You already have a project called "${duplicate.name}". Open it to edit, or use a different name.`);
        const row = { name: p.name, description: p.description, technologies: p.technologies, responsibilities: p.responsibilities, challenges: p.challenges, solutions: p.solutions, business_impact: p.businessImpact };
        check(p.id ? await supabase.from("projects").update(row).eq("id", p.id) : await supabase.from("projects").insert(row), "Couldn't save the project");
        return listProjects();
      }),
      delete: (id) => wrap(async () => {
        check(await supabase.from("projects").delete().eq("id", id), "Couldn't delete the project");
        return listProjects();
      }),
    },
    interview: {
      context: () => wrap(async () => {
        const uid = await userId();
        const [p, pr, jd, info] = await Promise.all([
          supabase.from("profiles").select("full_name, technical_skills").eq("user_id", uid).maybeSingle(),
          supabase.from("projects").select("id", { count: "exact", head: true }),
          supabase.from("job_descriptions").select("id", { count: "exact", head: true }),
          loadMe().catch(() => null),
        ]);
        const prof = p.data as { full_name?: string; technical_skills?: string[] } | null;
        return { hasProfile: Boolean(prof?.full_name || prof?.technical_skills?.length), projectCount: pr.count ?? 0, aiReady: Boolean(info?.aiReady), hasJobDescription: (jd.count ?? 0) > 0 };
      }),
      ask: (question: string, mode: AnswerMode, sessionId?: string, regenerate?: boolean, requestId?: string) => wrap(async () => {
        const rid = requestId ?? crypto.randomUUID();
        let sid = sessionId && (knownSessions.has(sessionId) || sessionId === live?.sessionId) ? sessionId : undefined;
        if (!sid) {
          sid = await newSession("workspace", question.trim());
          knownSessions.add(sid);
        }
        const meetingNotes = live && sid === live.sessionId && live.notes !== null ? live.notes : undefined;
        await startStream({ question, mode, sessionId: sid, regenerate: Boolean(regenerate), ...(meetingNotes !== undefined ? { meetingNotes } : {}) }, rid);
        return { requestId: rid, sessionId: sid };
      }),
    },
    live: {
      start: (consent) => wrap(async () => {
        if (consent.othersInformed !== true) throw new Error("Confirm that everyone has agreed before starting.");
        if (consent.organisation.trim().length < 2 || consent.permission.trim().length < 5) throw new Error("Fill in who allowed AI assistance, and how.");
        const title = consent.purpose === "meeting" ? `Meeting: ${consent.organisation.trim()}` : `Interview: ${consent.organisation.trim()}`;
        const sessionId = await newSession("live", title, consent);
        live = { sessionId, notes: consent.purpose === "meeting" ? (consent.notes ?? "") : null };
        return { sessionId, transcription: "groq" as const };
      }),
      stop: (sessionId) => wrap(async () => {
        closePanel();
        if (live?.sessionId === sessionId) live = null;
        await supabase.from("sessions").update({ ended_at: new Date().toISOString() }).eq("id", sessionId);
        return true;
      }),
      transcribe: (audio, mime) => wrap(async (): Promise<Transcript> => {
        if (!live) throw new Error("Start a live session first.");
        const res = await api(`/api/transcribe?sessionId=${live.sessionId}`, { method: "POST", headers: { "Content-Type": mime || "audio/webm" }, body: audio as unknown as BodyInit });
        return res.json();
      }),
    },
    window: {
      setAlwaysOnTop: () => Promise.resolve(fail(new Error("Use the floating panel to keep answers on top in the browser."))),
    },
    jobDescription: {
      import: () => wrap(async () => {
        const file = await pickFile(".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        if (!file) return null;
        const r = (await upload("jd", file)) as { fileName: string; text: string };
        check(await supabase.from("job_descriptions").delete().neq("id", "00000000-0000-0000-0000-000000000000"), "Couldn't replace the old job description");
        check(await supabase.from("job_descriptions").insert({ file_name: r.fileName, text: r.text.slice(0, MAX_JD_CHARS) }), "Couldn't save the job description");
        return getJd();
      }),
      get: () => wrap(getJd),
      clear: () => wrap(async () => {
        check(await supabase.from("job_descriptions").delete().neq("id", "00000000-0000-0000-0000-000000000000"), "Couldn't remove the job description");
        return true;
      }),
    },
    sessions: {
      list: () => wrap(listSessions),
      delete: (id) => wrap(async () => {
        if (live && (id === "all" || id === live.sessionId)) throw new Error("End the live session before deleting it.");
        const q = supabase.from("sessions").delete();
        check(id === "all" ? await q.neq("id", "00000000-0000-0000-0000-000000000000") : await q.eq("id", id), "Couldn't delete");
        return listSessions();
      }),
    },
    panel: {
      open: () => wrap(async () => {
        if (!live) throw new Error("Start a live session first.");
        await openPanel();
        return true;
      }),
      close: () => wrap(async () => {
        closePanel();
        return true;
      }),
      publish: (state) => wrap(async () => {
        panelBus.publish(state);
        return true;
      }),
      getState: () => wrap(async () => panelBus.getState()),
      onState: (l) => panelBus.onState(l),
      act: (a) => wrap(async () => {
        panelBus.act(a);
        return true;
      }),
      onAction: (l) => panelBus.onAction(l),
    },
  };
}
