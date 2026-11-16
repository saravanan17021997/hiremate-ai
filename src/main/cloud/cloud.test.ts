import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCloudConfig } from "./config";
import { AccountService, friendlyAuthError } from "./account";
import { mapRemoteSummary } from "../data/remoteSummary";
import { SecretStore, type Cipher } from "../secrets/secretStore";

const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
const cipher: Cipher = { isAvailable: () => true, encrypt: (p) => Buffer.from("x" + p), decrypt: (d) => d.toString().slice(1) };

describe("validateCloudConfig", () => {
  it("is simply off when nothing is set", () => expect(validateCloudConfig()).toEqual({ config: null, problem: null }));
  it("accepts a project URL and anon key", () => {
    expect(validateCloudConfig("https://abcd.supabase.co/", jwt({ role: "anon" })).config).toEqual({ url: "https://abcd.supabase.co", anonKey: jwt({ role: "anon" }) });
  });
  it("refuses a service_role key", () => expect(validateCloudConfig("https://abcd.supabase.co", jwt({ role: "service_role" })).problem).toMatch(/SECRET/));
  it("refuses an sb_secret_ key", () => expect(validateCloudConfig("https://abcd.supabase.co", "sb_secret_abc").problem).toMatch(/SECRET/));
  it("explains a wrong URL", () => expect(validateCloudConfig("http://localhost", jwt({ role: "anon" })).problem).toMatch(/supabase\.co/));
});

describe("friendlyAuthError", () => {
  it("rewrites common Supabase messages", () => {
    expect(friendlyAuthError("Invalid login credentials")).toBe("Wrong email or password.");
    expect(friendlyAuthError("Email not confirmed")).toMatch(/confirm your email/);
    expect(friendlyAuthError("User already registered")).toMatch(/already exists/);
  });
});

describe("AccountService", () => {
  const make = (auth: Record<string, unknown>) => {
    const secrets = SecretStore.inFolder(mkdtempSync(join(tmpdir(), "hm-acc-")), cipher);
    let options: any;
    const factory = ((_u: string, _k: string, o: unknown) => { options = o; return { auth }; }) as never;
    const svc = new AccountService({ url: "https://abcd.supabase.co", anonKey: "eyJ" }, secrets, null, factory);
    return { svc, secrets, options: () => options };
  };
  const noSession = { getSession: async () => ({ data: { session: null } }) };

  it("is 'not configured' without a project, with the reason", async () => {
    const svc = new AccountService(null, SecretStore.inFolder(mkdtempSync(join(tmpdir(), "hm-acc-")), cipher), "bad url");
    expect(await svc.status()).toEqual({ configured: false, signedIn: false, email: null, sessionPersisted: false, configProblem: "bad url" });
    await expect(svc.signIn("a@b.co", "password1")).rejects.toThrow(/isn't set up/);
  });

  it("reports when email confirmation is needed after sign-up", async () => {
    const { svc } = make({ ...noSession, signUp: async () => ({ data: { session: null, user: { id: "u" } }, error: null }) });
    expect((await svc.signUp("a@b.co", "password1")).needsEmailConfirmation).toBe(true);
  });

  it("returns a friendly message on wrong password", async () => {
    const { svc } = make({ ...noSession, signInWithPassword: async () => ({ error: { message: "Invalid login credentials" } }) });
    await expect(svc.signIn("a@b.co", "password1")).rejects.toThrow("Wrong email or password.");
  });

  it("shows the signed-in email", async () => {
    const { svc } = make({ getSession: async () => ({ data: { session: { user: { email: "a@b.co" } } } }), signInWithPassword: async () => ({ error: null }) });
    expect(await svc.signIn("a@b.co", "password1")).toMatchObject({ signedIn: true, email: "a@b.co", sessionPersisted: true });
  });

  it("keeps the session tokens in encrypted storage, not on the page", async () => {
    const { options, secrets } = make(noSession);
    const storage = options().auth.storage;
    storage.setItem("sb-abcd-auth-token", '{"access_token":"t"}');
    expect(secrets.get("supabase.sb-abcd-auth-token")).toBe('{"access_token":"t"}');
    expect(options().auth.detectSessionInUrl).toBe(false);
    storage.removeItem("sb-abcd-auth-token");
    expect(secrets.has("supabase.sb-abcd-auth-token")).toBe(false);
  });
});

describe("mapRemoteSummary", () => {
  it("maps the database summary to the dashboard", () => {
    const s = mapRemoteSummary(
      {
        profile: { full_name: "Saravanan R", professional_summary: "", total_experience_years: "8.0", current_designation: "Lead", technical_skills: ["n8n", "SQL", "React"], education: [], employment: [], achievements: [] },
        sessions: 3, mock_interviews: 1, questions_answered: 7, resume_parsed: true, projects: 2,
        recent: [{ id: "s1", kind: "mock", title: "HR round", started_at: "2026-11-04T10:00:00Z", question_count: 5 }],
      },
      true,
    );
    expect(s).toMatchObject({
      candidateName: "Saravanan R",
      stats: { sessions: 3, questionsAnswered: 7, mockInterviews: 1, resumeCompletion: 50 },
      setup: { profile: false, resume: true, aiProvider: true, projects: true },
      dataSource: "supabase",
    });
    expect(s.recentSessions[0]).toEqual({ id: "s1", kind: "mock", title: "HR round", startedAt: "2026-11-04T10:00:00Z", questionCount: 5 });
  });
});
