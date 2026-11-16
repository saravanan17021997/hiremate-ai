// All IPC handlers. Each one validates its input with zod (see register.ts).
import { randomUUID } from "node:crypto";
import { app, BrowserWindow, dialog, shell } from "electron";
import { z } from "zod";
import { IPC, IPC_EVENTS } from "@shared/ipc";
import { PROVIDER_IDS } from "@shared/providers";
import type { AppInfo, CandidateProfile, Project, StreamEvent } from "@shared/types";
import { handle } from "./register";
import type { LocalStore } from "../data/localStore";
import { buildDashboardSummary } from "../data/dashboardService";
import type { AiService } from "../ai/service";
import type { AccountService } from "../cloud/account";
import { mapRemoteSummary } from "../data/remoteSummary";
import { readResumeFile, type ResumeFile } from "../documents/extract";
import { structureResume } from "../resume/structure";
import { profileSchema } from "../resume/schema";
import type { ProfileService } from "../resume/profileService";
import type { ProjectService } from "../projects/projectService";
import type { SessionService } from "../interview/sessionService";
import type { JobDescriptionService } from "../jd/jobDescriptionService";
import { openPanel, closePanel, getPanel } from "../panelWindow";
import { buildFocusedContext, buildInterviewSystemPrompt, buildMeetingSystemPrompt, focusJobDescription } from "../interview/prompt";
import { transcribe } from "../live/transcribe";
import { setCaptureAllowed } from "../security";

const providerId = z.enum(PROVIDER_IDS);

export function registerIpcHandlers(
  store: LocalStore,
  ai: AiService,
  account: AccountService,
  profiles: ProfileService,
  projects: ProjectService,
  sessions: SessionService,
  jds: JobDescriptionService,
  windows: { load: (win: BrowserWindow, hash: string) => void; webPreferences: () => Electron.WebPreferences },
) {
  handle(IPC.appGetInfo, z.undefined(), (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    dataLocation: store.path,
  }));

  // Signed in: numbers come from Supabase (RLS limits them to this user). Otherwise: this PC's data.
  handle(IPC.dashboardGetSummary, z.undefined(), async () => {
    if (account.client && (await account.isSignedIn())) {
      const { data, error } = await account.client.rpc("dashboard_summary");
      if (error) throw new Error(`Couldn't load your synced data: ${error.message}`);
      return mapRemoteSummary(data, ai.isReady());
    }
    return buildDashboardSummary(store.read(), ai.isReady());
  });

  // Only https links, opened in the user's normal browser.
  handle(IPC.shellOpenExternal, z.string().url().startsWith("https://"), async (url) => {
    await shell.openExternal(url);
    return true;
  });

  // ---------- AI provider settings ----------
  handle(IPC.aiGetSettings, z.undefined(), () => ai.getSettings());

  handle(IPC.aiSaveKey, z.object({ provider: providerId, apiKey: z.string().min(1).max(300) }), ({ provider, apiKey }) =>
    ai.saveKey(provider, apiKey),
  );

  handle(IPC.aiRemoveKey, z.object({ provider: providerId }), ({ provider }) => ai.removeKey(provider));

  handle(IPC.aiSetActive, z.object({ provider: providerId, model: z.string().min(1).max(120) }), ({ provider, model }) =>
    ai.setActive(provider, model),
  );

  // ---------- Account (Supabase) ----------
  const credentials = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(8).max(72) });
  handle(IPC.accountGetStatus, z.undefined(), () => account.status());
  handle(IPC.accountSignUp, credentials, ({ email, password }) => account.signUp(email, password));
  handle(IPC.accountSignIn, credentials, ({ email, password }) => account.signIn(email, password));
  handle(IPC.accountSignOut, z.undefined(), () => account.signOut());

  // ---------- Resume intelligence ----------
  // The file text stays in the main process until "Save"; the UI only gets the AI's draft profile.
  const imports = new Map<string, ResumeFile & { extraction: unknown }>();

  handle(IPC.resumeImport, z.undefined(), async (_input, event) => {
    if (!ai.isReady()) throw new Error("Connect an AI provider in Settings first: it reads your resume.");
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { title: "Choose your resume", properties: ["openFile" as const], filters: [{ name: "Resume (PDF or Word)", extensions: ["pdf", "docx"] }] };
    const pick = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (pick.canceled || !pick.filePaths[0]) return null;

    const file = await readResumeFile(pick.filePaths[0]); // checks type and size (10 MB max), then extracts text
    const extraction = await structureResume((o) => ai.stream(o), file.text);
    const importId = randomUUID();
    imports.clear(); // keep only the latest import in memory
    imports.set(importId, { ...file, extraction });
    return {
      importId,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      textLength: file.text.length,
      profile: extraction.profile,
      projects: extraction.projects,
      model: ai.getSettings().activeModel ?? "",
    };
  });

  // Profile and projects are always saved on this PC as well, so answers are built from that copy:
  // no account round trip (and nothing that can hang) between a question and its answer.
  // Only when this PC has no copy yet (e.g. a new PC) is the account asked, for at most 2.5 s.
  type Background = { profile: CandidateProfile | null; projects: Project[] };
  let contextCache: { value: Background; at: number } | null = null;
  const background = async (): Promise<Background> => {
    const d = store.read();
    if (d.profile || d.projects.length) return { profile: d.profile, projects: d.projects };
    if (contextCache && Date.now() - contextCache.at < 120_000) return contextCache.value;
    const fromAccount = Promise.all([profiles.get(), projects.list()]).then(([{ profile }, { projects: list }]) => ({ profile, projects: list }));
    const value = await Promise.race([fromAccount, new Promise<null>((r) => setTimeout(() => r(null), 2500))]).catch(() => null);
    if (value === null) {
      console.warn("[ask] account data slow or unavailable: answering without it");
      return { profile: null, projects: [] };
    }
    contextCache = { value, at: Date.now() };
    return value;
  };
  const freshContext = <T>(result: T) => {
    contextCache = null;
    return result;
  };

  handle(IPC.profileGet, z.undefined(), () => profiles.get());

  handle(IPC.profileSave, z.object({ profile: profileSchema, importId: z.string().uuid().optional() }), async ({ profile, importId }) => {
    const resume = importId ? imports.get(importId) : undefined;
    if (importId && !resume) throw new Error("That upload has expired. Upload the resume again.");
    const saved = await profiles.save(profile, resume);
    if (importId) imports.delete(importId);
    return freshContext(saved);
  });

  // ---------- Projects ----------
  const field = (max: number) => z.string().trim().max(max);
  const projectInput = z.object({
    id: z.string().uuid().optional(),
    name: field(200).min(1, "Give the project a name."),
    description: field(4000),
    technologies: z.array(field(60)).max(60).transform((a) => [...new Set(a.filter(Boolean))]),
    responsibilities: field(4000),
    challenges: field(4000),
    solutions: field(4000),
    businessImpact: field(4000),
  });
  handle(IPC.projectsList, z.undefined(), () => projects.list());
  handle(IPC.projectsSave, projectInput, async (p) => freshContext(await projects.save(p)));
  handle(IPC.projectsDelete, z.object({ id: z.string().uuid() }), async ({ id }) => freshContext(await projects.remove(id)));

  // ---------- Live assistant (work meetings, or interviews where the employer allows AI) ----------
  let liveSessionId: string | null = null;
  let liveMeeting: { notes: string } | null = null; // set when the live session is a meeting

  handle(
    IPC.liveStart,
    z.object({
      purpose: z.enum(["meeting", "interview"]),
      organisation: z.string().trim().min(2, "Enter the meeting name (or the company, for an interview).").max(200),
      permission: z.string().trim().min(5, "Say how permission was given.").max(500),
      notes: z.string().trim().max(4000).optional(),
      othersInformed: z.literal(true, { errorMap: () => ({ message: "Everyone must know an AI assistant is transcribing." }) }),
    }),
    async ({ purpose, organisation, permission, notes }) => {
      if (!ai.isReady()) throw new Error("Connect an AI provider in Settings first.");
      const stt = ai.transcriptionKey();
      if (!stt) throw new Error("Live transcription needs a Groq (free) or OpenAI key. Add one in Settings.");
      const title = `${purpose === "meeting" ? "Meeting" : "Live interview"}: ${organisation}`;
      liveSessionId = await sessions.ensureSession(undefined, "live", title, { organisation, permission });
      liveMeeting = purpose === "meeting" ? { notes: notes ?? "" } : null;
      setCaptureAllowed(true);
      return { sessionId: liveSessionId, transcription: stt.provider };
    },
  );

  handle(IPC.liveStop, z.object({ sessionId: z.string().uuid() }), async ({ sessionId }) => {
    setCaptureAllowed(false);
    closePanel();
    lastPanelState = null;
    if (liveSessionId === sessionId) await sessions.end(sessionId);
    liveSessionId = null;
    liveMeeting = null;
    return true;
  });

  handle(
    IPC.liveTranscribe,
    z.object({ audio: z.instanceof(Uint8Array).refine((a) => a.byteLength > 0 && a.byteLength <= 8 * 1024 * 1024, "Audio segment too large."), mime: z.string().regex(/^audio\/(webm|ogg|wav)/) }),
    async ({ audio, mime }) => {
      if (!liveSessionId) throw new Error("No live session is running.");
      const stt = ai.transcriptionKey();
      if (!stt) throw new Error("No transcription key. Add a Groq or OpenAI key in Settings.");
      return transcribe(stt.provider, stt.apiKey, audio, mime, { baseUrl: !app.isPackaged ? process.env["HIREMATE_STT_BASE_URL"] : undefined });
    },
  );

  // ---------- Job description ----------
  handle(IPC.jdImport, z.undefined(), async (_input, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { title: "Choose the job description", properties: ["openFile" as const], filters: [{ name: "Job description (PDF or Word)", extensions: ["pdf", "docx"] }] };
    const pick = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (pick.canceled || !pick.filePaths[0]) return null;
    const file = await readResumeFile(pick.filePaths[0]); // same checks as resumes: real PDF/DOCX, 10 MB max, has text
    return jds.save(file.fileName, file.text);
  });
  handle(IPC.jdGet, z.undefined(), () => jds.get());
  handle(IPC.jdClear, z.undefined(), async () => {
    await jds.clear();
    return true;
  });

  // ---------- Saved sessions (history) ----------
  handle(IPC.sessionsList, z.undefined(), () => sessions.list());
  handle(IPC.sessionsDelete, z.object({ id: z.union([z.string().uuid(), z.literal("all")]) }), ({ id }) => {
    if (liveSessionId && (id === "all" || id === liveSessionId)) throw new Error("End the live session before deleting it.");
    return sessions.remove(id);
  });

  // ---------- Floating panel (mirrors the Live Assistant; never starts listening itself) ----------
  const panelState = z.object({
    status: z.enum(["idle", "listening", "transcribing", "thinking", "answering"]),
    question: z.string().max(2000),
    answer: z.string().max(30000),
    mode: z.enum(["short", "medium", "detailed"]),
    questionType: z.string().max(40).nullable(),
    confidence: z.enum(["High", "Medium", "Low"]).nullable(),
    firstWordsMs: z.number().nonnegative().nullable(),
    totalMs: z.number().nonnegative().nullable(),
    disclosure: z.string().max(400),
    notice: z.string().max(300).nullable(),
  });
  let mainSender: Electron.WebContents | null = null;
  let lastPanelState: z.infer<typeof panelState> | null = null;
  handle(IPC.panelOpen, z.undefined(), (_i, event) => {
    if (!liveSessionId) throw new Error("Start a live session first.");
    mainSender = event.sender;
    openPanel(windows.load, windows.webPreferences());
    return true;
  });
  handle(IPC.panelClose, z.undefined(), () => {
    closePanel();
    return true;
  });
  handle(IPC.panelPublish, panelState, (state) => {
    lastPanelState = liveSessionId ? state : null;
    const panel = getPanel();
    if (panel && liveSessionId) panel.webContents.send(IPC_EVENTS.panelState, state);
    return true;
  });
  handle(IPC.panelGetState, z.undefined(), () => (liveSessionId ? lastPanelState : null));
  handle(IPC.panelAction, z.object({ action: z.enum(["short", "medium", "detailed", "regenerate"]) }), ({ action }) => {
    if (mainSender && !mainSender.isDestroyed()) mainSender.send(IPC_EVENTS.panelAction, action);
    return true;
  });

  handle(IPC.windowAlwaysOnTop, z.object({ on: z.boolean() }), ({ on }, event) => {
    BrowserWindow.fromWebContents(event.sender)?.setAlwaysOnTop(on, "floating");
    return on;
  });

  // ---------- Streaming (test + interview answers) ----------
  const running = new Map<string, AbortController>();

  // ---------- AI Interview workspace ----------
  handle(IPC.interviewContext, z.undefined(), async () => {
    const [{ profile }, { projects: list }] = await Promise.all([profiles.get(), projects.list()]);
    return { hasProfile: Boolean(profile?.fullName || profile?.technicalSkills.length), projectCount: list.length, aiReady: ai.isReady(), hasJobDescription: Boolean(jds.get()) };
  });

  handle(
    IPC.interviewAsk,
    z.object({
      question: z.string().trim().min(3, "Type a question first.").max(1000),
      mode: z.enum(["short", "medium", "detailed"]),
      sessionId: z.string().uuid().optional(),
      regenerate: z.boolean().optional(),
      // Chosen by the window, so every streamed piece is tied to this exact question from the start.
      requestId: z.string().uuid().optional(),
    }),
    async ({ question, mode, sessionId, regenerate, requestId: wanted }, event) => {
      if (!ai.isReady()) throw new Error("Connect an AI provider in Settings first.");
      if (wanted && running.has(wanted)) throw new Error("That request is already running.");
      const t0 = Date.now();
      const [bg, sid] = await Promise.all([background(), sessions.ensureSession(sessionId, "workspace", question)]);
      // Only what this question needs: core profile, best-matching projects, matching job-description lines.
      const context = buildFocusedContext(bg.profile, bg.projects, question);
      const jd = focusJobDescription(jds.get()?.text ?? "", question);
      const tContext = Date.now() - t0;
      // Earlier questions in this session, so follow-ups ("and how did you test it?") make sense.
      const earlier = sessions.recent(sid, 5);
      const prev = earlier[earlier.length - 1]?.question;
      // Don't show the AI its own previous try, or the first half of this same question.
      if (prev && ((regenerate && prev === question) || (question.length > prev.length && question.startsWith(prev)))) earlier.pop();
      // The last 2 questions are enough for follow-ups ("that project"); answers are shortened to keep requests small.
      const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
      const history = earlier.slice(-2).flatMap((h) => [
        { role: "user" as const, content: `<question>${clip(h.question, 300)}</question>` },
        { role: "assistant" as const, content: clip(h.answer, 500) },
      ]);
      const requestId = wanted ?? randomUUID();
      const controller = new AbortController();
      running.set(requestId, controller);
      const sender = event.sender;
      const send = (e: StreamEvent) => {
        if (!sender.isDestroyed()) sender.send(IPC_EVENTS.aiStream, e);
      };
      let answer = "";
      let firstAt = 0;
      const stages: string[] = [];
      send({ requestId, type: "status", stage: "sent" });
      void ai
        .stream({
          system:
            liveMeeting && sid === liveSessionId
              ? buildMeetingSystemPrompt(context, liveMeeting.notes, mode, jd)
              : buildInterviewSystemPrompt(context, mode, jd),
          messages: [...history, { role: "user", content: `<question>${question}</question>` }],
          maxTokens: { short: 300, medium: 650, detailed: 1100 }[mode],
          signal: controller.signal,
          onStage: (stage) => {
            if (!stages.includes(stage)) stages.push(`${stage} ${Date.now() - t0} ms`);
            send({ requestId, type: "status", stage });
          },
          onDelta: (text) => {
            if (!firstAt) firstAt = Date.now();
            answer += text;
            send({ requestId, type: "delta", text });
          },
        })
        .then(() => {
          send({ requestId, type: "done" }); // show "done" straight away; saving happens in the background
          console.log(`[ask] ${mode} · context ${tContext} ms · ${stages.join(" · ")} · first words ${firstAt ? firstAt - t0 : "-"} ms · total ${Date.now() - t0} ms`);
          if (answer.trim()) {
            void sessions.addItem(sid, question, answer, Boolean(regenerate)).catch((e: Error) => console.warn("[sessions] answer not saved:", e.message));
          }
        })
        .catch((e: Error) => {
          if (e.name !== "AbortError") console.warn(`[ask] failed after ${Date.now() - t0} ms (${stages.join(" · ") || "no reply"}):`, e.message);
          else console.log(`[ask] stopped after ${Date.now() - t0} ms (${stages.join(" · ") || "no reply yet"})`);
          send(e.name === "AbortError" ? { requestId, type: "done" } : { requestId, type: "error", error: e.message });
        })
        .finally(() => running.delete(requestId));
      return { requestId, sessionId: sid };
    },
  );

  handle(IPC.aiStartTest, z.object({ prompt: z.string().trim().min(1).max(500) }), ({ prompt }, event) => {
    if (!ai.isReady()) throw new Error("Set up an AI provider first.");
    const requestId = randomUUID();
    const controller = new AbortController();
    running.set(requestId, controller);
    const sender = event.sender;
    const send = (e: StreamEvent) => {
      if (!sender.isDestroyed()) sender.send(IPC_EVENTS.aiStream, e);
    };

    // Runs in the background; the UI receives pieces as they arrive.
    void ai
      .stream({
        system: "You are the connection test inside HireMate AI, an interview preparation app. Reply in at most three short sentences.",
        messages: [{ role: "user", content: prompt }],
        maxTokens: 300,
        signal: controller.signal,
        onDelta: (text) => send({ requestId, type: "delta", text }),
      })
      .then(() => send({ requestId, type: "done" }))
      .catch((e: Error) => send(e.name === "AbortError" ? { requestId, type: "done" } : { requestId, type: "error", error: e.message }))
      .finally(() => running.delete(requestId));

    return { requestId };
  });

  handle(IPC.aiCancel, z.object({ requestId: z.string().uuid() }), ({ requestId }) => {
    running.get(requestId)?.abort();
    return running.delete(requestId);
  });
}
