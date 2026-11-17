// The shape of window.hiremate, the API the preload script gives the UI.
import type { IpcResult } from "./ipc";
import type { FeedLink, JobDescription, PanelAction, PanelState, PhoneFeed, PhoneFeedState, PhoneRequest, SessionRecord, Transcript, LiveConsent, LiveStart, AccountStatus, AiSettings, AnswerMode, AppInfo, AskResult, WorkspaceContextStatus, CandidateProfile, DashboardSummary, ProjectInput, ProjectList, ProviderId, ResumeImport, SavedProfile, SignUpResult, StreamEvent } from "./types";

export interface HireMateApi {
  /** "desktop" (Electron) or "web" (browser version on Vercel). A few screens differ slightly. */
  platform: "desktop" | "web";
  app: {
    getInfo(): Promise<IpcResult<AppInfo>>;
    openExternal(url: string): Promise<IpcResult<boolean>>;
  };
  dashboard: {
    getSummary(): Promise<IpcResult<DashboardSummary>>;
  };
  ai: {
    getSettings(): Promise<IpcResult<AiSettings>>;
    /** Tests the key with the provider first; it is saved (encrypted) only if the test passes. */
    saveKey(provider: ProviderId, apiKey: string): Promise<IpcResult<AiSettings>>;
    removeKey(provider: ProviderId): Promise<IpcResult<AiSettings>>;
    setActive(provider: ProviderId, model: string): Promise<IpcResult<AiSettings>>;
    /** Starts a short streamed test answer; pieces arrive through onStream. */
    startTest(prompt: string): Promise<IpcResult<{ requestId: string }>>;
    cancel(requestId: string): Promise<IpcResult<boolean>>;
    onStream(listener: (event: StreamEvent) => void): () => void;
  };
  account: {
    getStatus(): Promise<IpcResult<AccountStatus>>;
    signUp(email: string, password: string): Promise<IpcResult<SignUpResult>>;
    signIn(email: string, password: string): Promise<IpcResult<AccountStatus>>;
    signOut(): Promise<IpcResult<AccountStatus>>;
  };
  resume: {
    /** Opens a file picker, checks and reads the file, and asks the AI for a draft profile. null = cancelled. */
    import(): Promise<IpcResult<ResumeImport | null>>;
  };
  profile: {
    get(): Promise<IpcResult<SavedProfile>>;
    /** Saves the reviewed profile; importId links it to the uploaded resume. */
    save(profile: CandidateProfile, importId?: string): Promise<IpcResult<SavedProfile>>;
  };
  projects: {
    list(): Promise<IpcResult<ProjectList>>;
    /** Creates (no id) or updates (with id) a project; returns the updated list. */
    save(project: ProjectInput): Promise<IpcResult<ProjectList>>;
    delete(id: string): Promise<IpcResult<ProjectList>>;
  };
  interview: {
    /** What the AI knows about you (profile, projects) and whether a provider is ready. */
    context(): Promise<IpcResult<WorkspaceContextStatus>>;
    /** Streams an answer suggestion; pieces arrive through ai.onStream. Saves the Q&A to the session when done. */
    /** regenerate: ask the same question again and replace the previous answer. */
    /** requestId: chosen by the caller so streamed pieces can never be matched to a different question. */
    ask(question: string, mode: AnswerMode, sessionId?: string, regenerate?: boolean, requestId?: string): Promise<IpcResult<AskResult>>;
  };
  live: {
    /** Records consent, creates a live session and allows system-audio capture until stop(). */
    start(consent: LiveConsent): Promise<IpcResult<LiveStart>>;
    stop(sessionId: string): Promise<IpcResult<boolean>>;
    /** One recorded speech segment (webm/opus) to text. */
    transcribe(audio: Uint8Array, mime: string): Promise<IpcResult<Transcript>>;
  };
  window: {
    setAlwaysOnTop(on: boolean): Promise<IpcResult<boolean>>;
  };
  jobDescription: {
    /** Opens a file picker (PDF or DOCX), extracts the text and saves it. null = cancelled. */
    import(): Promise<IpcResult<JobDescription | null>>;
    get(): Promise<IpcResult<JobDescription | null>>;
    clear(): Promise<IpcResult<boolean>>;
  };
  sessions: {
    list(): Promise<IpcResult<SessionRecord[]>>;
    /** Deletes one session, or "all", on this PC and in Supabase. */
    delete(id: string | "all"): Promise<IpcResult<SessionRecord[]>>;
  };
  panel: {
    open(): Promise<IpcResult<boolean>>;
    close(): Promise<IpcResult<boolean>>;
    /** Main window → panel. */
    publish(state: PanelState): Promise<IpcResult<boolean>>;
    /** The latest state, for a panel that has just opened. */
    getState(): Promise<IpcResult<PanelState | null>>;
    onState(listener: (state: PanelState) => void): () => void;
    /** Panel → main window. */
    act(action: PanelAction): Promise<IpcResult<boolean>>;
    onAction(listener: (action: PanelAction) => void): () => void;
  };
  /** Phone screen: a live session on the laptop shown on your phone. Web version only. */
  phone: {
    available: boolean;
    /** Laptop → phone. The rev is added here, always growing. */
    publish(feed: { active: boolean; sessionId: string | null; seq: number; state: PhoneFeedState | null }): Promise<IpcResult<boolean>>;
    /** "I'm still here": the laptop's live page, or the phone screen. */
    seen(role: "laptop" | "viewer"): Promise<IpcResult<boolean>>;
    /** Phone → laptop: a button press. */
    request(r: PhoneRequest): Promise<IpcResult<boolean>>;
    /** Every change to your live row, as it happens (falls back to checking every second). */
    watch(onFeed: (feed: PhoneFeed | null) => void, onLink: (link: FeedLink) => void): () => void;
  };
}
