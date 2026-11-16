// Local data file in the app's private folder (%APPDATA%\HireMate AI on Windows).
// Phase 1 keeps data here; Phase 2 moves profile, sessions and projects to Supabase (with RLS).
// The file is validated on every load, and written atomically so a crash can't leave half a file.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

const profileSchema = z.object({
  fullName: z.string(),
  professionalSummary: z.string(),
  totalExperienceYears: z.number().min(0).max(60).nullable(),
  currentDesignation: z.string(),
  technicalSkills: z.array(z.string()),
  education: z.array(z.object({ degree: z.string(), institution: z.string(), years: z.string() })),
  employment: z.array(z.object({ role: z.string(), company: z.string(), years: z.string() })),
  achievements: z.array(z.string()),
});

const sessionSchema = z.object({
  id: z.string(),
  kind: z.enum(["workspace", "mock", "live"]),
  // Live sessions record who allowed AI assistance and how (Phase 6).
  consent: z.object({ organisation: z.string(), permission: z.string(), confirmedAt: z.string() }).optional(),
  title: z.string(),
  startedAt: z.string(),
  questions: z.array(z.object({ question: z.string(), answer: z.string(), askedAt: z.string() })),
});

const settingsSchema = z.object({
  aiProvider: z.enum(["gemini", "groq", "openai", "anthropic"]).nullable(),
  aiModel: z.string().nullable(),
  // Model lists returned by each provider for the saved key (not secret).
  aiModels: z.record(z.string(), z.array(z.string())),
});

export const DEFAULT_SETTINGS: z.infer<typeof settingsSchema> = { aiProvider: null, aiModel: null, aiModels: {} };

export const storeSchema = z.object({
  version: z.literal(1),
  settings: settingsSchema.default(DEFAULT_SETTINGS), // added in Phase 2A; older files get the default
  profile: profileSchema.nullable(),
  resumeParsedAt: z.string().nullable(),
  resumeFileName: z.string().nullable().default(null), // added in Phase 3
  // Phase 4 added the detail fields; older files only had id + name, so they default to empty.
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().default(""),
      technologies: z.array(z.string()).default([]),
      responsibilities: z.string().default(""),
      challenges: z.string().default(""),
      solutions: z.string().default(""),
      businessImpact: z.string().default(""),
      updatedAt: z.string().default(() => new Date(0).toISOString()),
    }),
  ),
  // Projects the AI found in the last uploaded resume, offered on the Projects page.
  resumeProjects: z.array(z.object({ name: z.string(), description: z.string(), technologies: z.array(z.string()) })).default([]),
  sessions: z.array(sessionSchema),
  // Job description used as extra context for answers (Phase 6b).
  jobDescription: z.object({ fileName: z.string(), text: z.string(), uploadedAt: z.string() }).nullable().default(null),
});

export type StoreData = z.infer<typeof storeSchema>;

export const EMPTY_STORE: StoreData = { version: 1, settings: DEFAULT_SETTINGS, profile: null, resumeParsedAt: null, resumeFileName: null, projects: [], resumeProjects: [], sessions: [], jobDescription: null };

export class LocalStore {
  constructor(private readonly filePath: string) {}

  static inFolder(folder: string) {
    return new LocalStore(join(folder, "hiremate-data.json"));
  }

  get path() {
    return this.filePath;
  }

  /** Reads the file. A missing file means a new user; an unreadable file is kept aside and replaced. */
  read(): StoreData {
    if (!existsSync(this.filePath)) return structuredClone(EMPTY_STORE);
    try {
      return storeSchema.parse(JSON.parse(readFileSync(this.filePath, "utf8")));
    } catch {
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      renameSync(this.filePath, backup);
      console.warn(`[store] Data file was unreadable; moved to ${backup} and started fresh.`);
      return structuredClone(EMPTY_STORE);
    }
  }

  write(data: StoreData) {
    const valid = storeSchema.parse(data);
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    writeFileSync(temp, JSON.stringify(valid, null, 2), "utf8");
    renameSync(temp, this.filePath); // atomic replace
  }
}
