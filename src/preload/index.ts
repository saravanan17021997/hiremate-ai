// The only bridge between the UI and the main process.
// It exposes a small, typed API on window.hiremate. The page never gets ipcRenderer itself.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC, IPC_EVENTS, type IpcResult } from "../shared/ipc";
import type { JobDescription, PanelAction, PanelState, SessionRecord, Transcript, LiveStart, AccountStatus, AiSettings, AppInfo, AskResult, WorkspaceContextStatus, DashboardSummary, ProjectList, ResumeImport, SavedProfile, SignUpResult, StreamEvent } from "../shared/types";
import type { HireMateApi } from "../shared/api";

const invoke = <T>(channel: string, input?: unknown) => ipcRenderer.invoke(channel, input) as Promise<IpcResult<T>>;

const api: HireMateApi = {
  platform: "desktop",
  app: {
    getInfo: () => invoke<AppInfo>(IPC.appGetInfo),
    openExternal: (url) => invoke<boolean>(IPC.shellOpenExternal, url),
  },
  dashboard: {
    getSummary: () => invoke<DashboardSummary>(IPC.dashboardGetSummary),
  },
  ai: {
    getSettings: () => invoke<AiSettings>(IPC.aiGetSettings),
    saveKey: (provider, apiKey) => invoke<AiSettings>(IPC.aiSaveKey, { provider, apiKey }),
    removeKey: (provider) => invoke<AiSettings>(IPC.aiRemoveKey, { provider }),
    setActive: (provider, model) => invoke<AiSettings>(IPC.aiSetActive, { provider, model }),
    startTest: (prompt) => invoke<{ requestId: string }>(IPC.aiStartTest, { prompt }),
    cancel: (requestId) => invoke<boolean>(IPC.aiCancel, { requestId }),
    onStream: (listener) => {
      const handler = (_e: IpcRendererEvent, event: StreamEvent) => listener(event);
      ipcRenderer.on(IPC_EVENTS.aiStream, handler);
      return () => ipcRenderer.removeListener(IPC_EVENTS.aiStream, handler);
    },
  },
  account: {
    getStatus: () => invoke<AccountStatus>(IPC.accountGetStatus),
    signUp: (email, password) => invoke<SignUpResult>(IPC.accountSignUp, { email, password }),
    signIn: (email, password) => invoke<AccountStatus>(IPC.accountSignIn, { email, password }),
    signOut: () => invoke<AccountStatus>(IPC.accountSignOut),
  },
  resume: {
    import: () => invoke<ResumeImport | null>(IPC.resumeImport),
  },
  profile: {
    get: () => invoke<SavedProfile>(IPC.profileGet),
    save: (profile, importId) => invoke<SavedProfile>(IPC.profileSave, { profile, importId }),
  },
  projects: {
    list: () => invoke<ProjectList>(IPC.projectsList),
    save: (project) => invoke<ProjectList>(IPC.projectsSave, project),
    delete: (id) => invoke<ProjectList>(IPC.projectsDelete, { id }),
  },
  interview: {
    context: () => invoke<WorkspaceContextStatus>(IPC.interviewContext),
    ask: (question, mode, sessionId, regenerate, requestId) => invoke<AskResult>(IPC.interviewAsk, { question, mode, sessionId, regenerate, requestId }),
  },
  live: {
    start: (consent) => invoke<LiveStart>(IPC.liveStart, consent),
    stop: (sessionId) => invoke<boolean>(IPC.liveStop, { sessionId }),
    transcribe: (audio, mime) => invoke<Transcript>(IPC.liveTranscribe, { audio, mime }),
  },
  window: {
    setAlwaysOnTop: (on) => invoke<boolean>(IPC.windowAlwaysOnTop, { on }),
  },
  jobDescription: {
    import: () => invoke<JobDescription | null>(IPC.jdImport),
    get: () => invoke<JobDescription | null>(IPC.jdGet),
    clear: () => invoke<boolean>(IPC.jdClear),
  },
  sessions: {
    list: () => invoke<SessionRecord[]>(IPC.sessionsList),
    delete: (id) => invoke<SessionRecord[]>(IPC.sessionsDelete, { id }),
  },
  panel: {
    open: () => invoke<boolean>(IPC.panelOpen),
    close: () => invoke<boolean>(IPC.panelClose),
    publish: (state) => invoke<boolean>(IPC.panelPublish, state),
    getState: () => invoke<PanelState | null>(IPC.panelGetState),
    onState: (listener) => {
      const handler = (_e: IpcRendererEvent, state: PanelState) => listener(state);
      ipcRenderer.on(IPC_EVENTS.panelState, handler);
      return () => ipcRenderer.removeListener(IPC_EVENTS.panelState, handler);
    },
    act: (action) => invoke<boolean>(IPC.panelAction, { action }),
    onAction: (listener) => {
      const handler = (_e: IpcRendererEvent, action: PanelAction) => listener(action);
      ipcRenderer.on(IPC_EVENTS.panelAction, handler);
      return () => ipcRenderer.removeListener(IPC_EVENTS.panelAction, handler);
    },
  },
  // Phone screen runs on the web version (laptop in Chrome/Edge → phone); the desktop app doesn't send to a phone.
  phone: {
    available: false,
    publish: async () => ({ ok: false, error: "Phone screen works with the web version." }),
    seen: async () => ({ ok: false, error: "Phone screen works with the web version." }),
    request: async () => ({ ok: false, error: "Phone screen works with the web version." }),
    watch: () => () => undefined,
  },
};

contextBridge.exposeInMainWorld("hiremate", api);
