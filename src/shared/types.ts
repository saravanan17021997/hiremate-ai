// Data shapes shared by the main process (Node) and the renderer (React).
// Only plain data here: no Node or browser APIs.

export interface CandidateProfile {
  fullName: string;
  professionalSummary: string;
  totalExperienceYears: number | null;
  currentDesignation: string;
  technicalSkills: string[];
  education: { degree: string; institution: string; years: string }[];
  employment: { role: string; company: string; years: string }[];
  achievements: string[];
}

export interface SessionSummary {
  id: string;
  kind: "workspace" | "mock" | "live";
  title: string;
  startedAt: string; // ISO date
  questionCount: number;
}

export interface SetupStatus {
  profile: boolean; // profile at least 60% complete
  resume: boolean; // a resume has been uploaded and parsed
  aiProvider: boolean; // an AI provider key is saved
  projects: boolean; // at least one project in the knowledge base
}

export interface DashboardSummary {
  candidateName: string | null;
  stats: {
    sessions: number;
    questionsAnswered: number;
    mockInterviews: number;
    resumeCompletion: number; // 0-100
  };
  recentSessions: SessionSummary[];
  setup: SetupStatus;
  dataSource: "local" | "supabase";
}

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  dataLocation: string;
}

// ---------- Phase 2A: AI providers ----------

export type ProviderId = "gemini" | "groq" | "openai" | "anthropic";

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  configured: boolean; // a working key is saved (encrypted) on this PC
  keyHint: string | null; // last 4 characters only, e.g. "…a1B2"
  models: string[]; // models this key can use (from the provider's API)
}

export interface AiSettings {
  providers: ProviderStatus[];
  activeProvider: ProviderId | null;
  activeModel: string | null;
  encryptionAvailable: boolean; // Windows can encrypt secrets for this user
}

/** Progress while waiting for the first words, so the screen can say what's happening. */
export type StreamStage = "sent" | "connected" | "thinking" | "retrying";

export type StreamEvent =
  | { requestId: string; type: "status"; stage: StreamStage }
  | { requestId: string; type: "delta"; text: string }
  | { requestId: string; type: "done" }
  | { requestId: string; type: "error"; error: string };

// ---------- Phase 2B: account ----------

export interface AccountStatus {
  configured: boolean; // the app was built with a Supabase project URL + public key
  signedIn: boolean;
  email: string | null;
  sessionPersisted: boolean; // sign-in is remembered (encrypted) on this PC
  configProblem: string | null; // why cloud sync is off, if the build's settings are wrong
}

export interface SignUpResult {
  status: AccountStatus;
  needsEmailConfirmation: boolean;
}

// ---------- Phase 3: resume intelligence ----------

export interface ExtractedProject {
  name: string;
  description: string;
  technologies: string[];
}

export interface ResumeImport {
  importId: string; // the main process keeps the file text under this id until you save
  fileName: string;
  fileType: "pdf" | "docx";
  fileSize: number;
  textLength: number;
  profile: CandidateProfile; // AI draft, for you to review and edit
  projects: ExtractedProject[]; // offered to the Projects module (Phase 4)
  model: string;
}

export interface SavedProfile {
  profile: CandidateProfile | null;
  resumeFileName: string | null;
  resumeParsedAt: string | null;
  savedTo: "local" | "supabase";
}

// ---------- Phase 4: project knowledge base ----------

export interface Project {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  responsibilities: string;
  challenges: string;
  solutions: string;
  businessImpact: string;
  updatedAt: string;
}

export type ProjectInput = Omit<Project, "id" | "updatedAt"> & { id?: string };

export interface ProjectList {
  projects: Project[];
  suggestions: ExtractedProject[]; // found in your resume and not added yet
  savedTo: "local" | "supabase";
}

// ---------- Phase 5: AI interview workspace ----------

export type AnswerMode = "short" | "medium" | "detailed";

export interface AskResult {
  requestId: string; // streamed pieces arrive on ai:stream with this id
  sessionId: string;
}

export interface SessionItem {
  question: string;
  answer: string;
  askedAt: string;
}

export interface WorkspaceContextStatus {
  hasProfile: boolean;
  projectCount: number;
  aiReady: boolean;
  hasJobDescription: boolean;
}

// ---------- Phase 6: live assistant (only where the employer allows AI help) ----------

export type LivePurpose = "meeting" | "interview";

export interface LiveConsent {
  purpose: LivePurpose;
  organisation: string; // meeting: the meeting's name; interview: company that allowed AI assistance
  permission: string; // meeting: "All participants informed"; interview: how they allowed it, e.g. "HR email, 4 Nov"
  notes?: string; // meeting only: agenda or facts the AI may use in replies
  othersInformed: true; // participants / interviewer know an AI assistant is transcribing
}

export interface LiveStart {
  sessionId: string;
  transcription: "groq" | "openai";
}

// ---------- Phase 6b: confidence, job description, history, floating panel ----------

export interface Transcript {
  text: string;
  confidence: number | null; // 0..1 from the speech model when available
  unclear: boolean; // speech was too unclear to trust
}

export interface JobDescription {
  fileName: string;
  text: string;
  uploadedAt: string;
}

export interface SessionRecord {
  id: string;
  kind: "workspace" | "mock" | "live";
  title: string;
  startedAt: string;
  consent?: { organisation: string; permission: string; confirmedAt: string };
  questions: SessionItem[];
}

export type PanelStatus = "idle" | "listening" | "transcribing" | "thinking" | "answering";

export interface PanelState {
  status: PanelStatus;
  question: string;
  answer: string; // markdown, meta lines removed
  mode: AnswerMode;
  questionType: string | null;
  confidence: "High" | "Medium" | "Low" | null;
  firstWordsMs: number | null;
  totalMs: number | null;
  disclosure: string; // e.g. "AI assistant in use · Weekly review (participants informed)"
  notice: string | null; // e.g. "Could not clearly understand the question"
}

export type PanelAction = "short" | "medium" | "detailed" | "regenerate";
