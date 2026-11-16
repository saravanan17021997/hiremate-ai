import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CandidateProfile, Project } from "@shared/types";
import { buildCandidateContext, buildFocusedContext, buildInterviewSystemPrompt, buildMeetingSystemPrompt, focusJobDescription } from "./prompt";
import { SessionService } from "./sessionService";
import { LocalStore } from "../data/localStore";
import { AccountService } from "../cloud/account";
import { SecretStore } from "../secrets/secretStore";
import { buildDashboardSummary } from "../data/dashboardService";
import { JobDescriptionService, MAX_JD_CHARS } from "../jd/jobDescriptionService";

const profile: CandidateProfile = {
  fullName: "Saravanan R", professionalSummary: "", totalExperienceYears: 8, currentDesignation: "Digital Transformation Lead",
  technicalSkills: ["n8n", "Supabase"], education: [], employment: [{ role: "Data Analyst", company: "Stats Perform", years: "2020 - 2025" }], achievements: [],
};
const project: Project = {
  id: "p1", name: "SaraDev POS", description: "Android billing app", technologies: ["Kotlin"], responsibilities: "", challenges: "Double billing",
  solutions: "", businessImpact: "121 tests", updatedAt: "2026-11-04T00:00:00Z",
};

describe("buildCandidateContext", () => {
  it("includes filled facts and skips empty ones", () => {
    const c = buildCandidateContext(profile, [project]);
    expect(c).toContain("Current role: Digital Transformation Lead");
    expect(c).toContain("Total experience: 8 years");
    expect(c).toContain("- Data Analyst, Stats Perform, 2020 - 2025");
    expect(c).toContain("Project: SaraDev POS");
    expect(c).toContain("Challenges: Double billing");
    expect(c).not.toContain("Summary:");
    expect(c).not.toContain("Solutions:");
  });
  it("is empty with nothing saved", () => expect(buildCandidateContext(null, [])).toBe(""));
  it("is capped in size", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ ...project, id: String(i), name: `Project ${i}`, description: "x".repeat(200) }));
    expect(buildCandidateContext(profile, many).length).toBeLessThan(14_100);
  });
});

describe("only what the question needs", () => {
  const mk = (name: string, tech: string[], description: string): Project => ({ ...project, id: name, name, technologies: tech, description, challenges: "", businessImpact: "" });
  const many = [mk("SaraDev POS", ["Kotlin"], "Android billing app"), mk("Invoice bot", ["n8n", "WhatsApp"], "Sends invoices on WhatsApp"), mk("BC Dashboard", ["Supabase", "Business Central"], "Live sales dashboard"), mk("Lane detection", ["OpenCV"], "College ML project")];
  it("puts the best-matching projects first and keeps the rest as names", () => {
    const c = buildFocusedContext(profile, many, "How did you use n8n with WhatsApp?");
    expect(c.indexOf("Project: Invoice bot")).toBeGreaterThan(-1);
    expect(c.indexOf("Project: Invoice bot")).toBeLessThan(c.indexOf("Project: SaraDev POS") === -1 ? Infinity : c.indexOf("Project: SaraDev POS"));
    expect(c).toContain("Name: Saravanan R");
    expect(c.length).toBeLessThanOrEqual(2_900);
  });
  it("keeps only the job-description lines that relate to the question", () => {
    const jd = Array.from({ length: 80 }, (_, i) => (i === 40 ? "Strong SQL and Power BI reporting." : `Line ${i}: general duties and team collaboration.`)).join("\n");
    const f = focusJobDescription(jd, "Tell me about your SQL experience");
    expect(f).toContain("Strong SQL and Power BI reporting.");
    expect(f.length).toBeLessThanOrEqual(950);
    expect(focusJobDescription("Short JD.", "anything")).toBe("Short JD.");
  });
});

describe("buildInterviewSystemPrompt", () => {
  it("puts honesty rules, the background and the job description in the prompt, with the right format", () => {
    const short = buildInterviewSystemPrompt("Name: Saravanan R", "short", "Needs Python and SQL");
    expect(short).toMatch(/Never invent/);
    expect(short).toContain("<user_background>\nName: Saravanan R\n</user_background>");
    expect(short).toContain("<job_description>\nNeeds Python and SQL\n</job_description>");
    expect(short).toMatch(/It is NOT the user's experience/);
    expect(short).toContain("2 to 3 sentences");
    expect(short).toContain("Question type: <Technical|Behavioural|HR|Project|General>");
    expect(short).toContain("Confidence: <High|Medium|Low>");
    expect(short).toMatch(/STAR/);
    expect(buildInterviewSystemPrompt("", "medium")).toContain("30 to 60 seconds");
    const detailed = buildInterviewSystemPrompt("", "detailed");
    expect(detailed).toContain("1 to 2 minutes");
    expect(detailed).toContain("(empty: the user hasn't added");
    expect(detailed).toContain("(none uploaded)");
  });
});

describe("buildMeetingSystemPrompt", () => {
  it("uses meeting notes and tells the AI not to invent commitments", () => {
    const p = buildMeetingSystemPrompt("Name: Saravanan R", "Q3 target is 1.2 Cr", "short");
    expect(p).toContain("<meeting_notes>\nQ3 target is 1.2 Cr\n</meeting_notes>");
    expect(p).toMatch(/Don't commit the user to deadlines/);
    expect(p).toMatch(/Never invent/);
    expect(buildMeetingSystemPrompt("", "", "detailed")).toContain("(none provided)");
  });
});

describe("SessionService (on this PC)", () => {
  it("creates one session per sitting and counts its questions on the dashboard", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-sess-"));
    const store = LocalStore.inFolder(dir);
    const svc = new SessionService(store, new AccountService(null, SecretStore.inFolder(dir, { isAvailable: () => true, encrypt: (p) => Buffer.from(p), decrypt: (d) => d.toString() })));
    const id = await svc.ensureSession(undefined, "workspace", "Tell me about yourself");
    await svc.addItem(id, "Tell me about yourself", "## Answer\nI build automations.");
    expect(await svc.ensureSession(id, "workspace", "ignored")).toBe(id);
    await svc.addItem(id, "Why this role?", "## Answer\nBigger systems.");
    const summary = buildDashboardSummary(store.read(), true);
    expect(summary.stats).toMatchObject({ sessions: 1, questionsAnswered: 2, mockInterviews: 0 });
    expect(summary.recentSessions[0]).toMatchObject({ title: "Tell me about yourself", questionCount: 2, kind: "workspace" });
  });
});

function offline() {
  const dir = mkdtempSync(join(tmpdir(), "hm-sess-"));
  const store = LocalStore.inFolder(dir);
  const account = new AccountService(null, SecretStore.inFolder(dir, { isAvailable: () => true, encrypt: (p) => Buffer.from(p), decrypt: (d) => d.toString() }));
  return { store, account };
}

describe("Regenerate, delete and job description (on this PC)", () => {
  it("Regenerate replaces the last answer to the same question instead of adding one", async () => {
    const { store, account } = offline();
    const svc = new SessionService(store, account);
    const id = await svc.ensureSession(undefined, "workspace", "What is REST?");
    await svc.addItem(id, "What is REST?", "first try");
    await svc.addItem(id, "What is REST?", "second try", true);
    expect(svc.recent(id)).toEqual([{ question: "What is REST?", answer: "second try" }]);
    await svc.addItem(id, "Another one?", "x", true); // different question: added, not replaced
    expect(svc.recent(id)).toHaveLength(2);
  });

  it("a question completed after a short pause replaces its first half", async () => {
    const { store, account } = offline();
    const svc = new SessionService(store, account);
    const id = await svc.ensureSession(undefined, "live", "x", { organisation: "Acme", permission: "HR email" });
    await svc.addItem(id, "Can you tell me about", "half");
    await svc.addItem(id, "Can you tell me about your n8n work?", "whole");
    expect(svc.recent(id)).toEqual([{ question: "Can you tell me about your n8n work?", answer: "whole" }]);
  });

  it("deletes one session, then all, and lists newest first", async () => {
    const { store, account } = offline();
    const svc = new SessionService(store, account);
    const a = await svc.ensureSession(undefined, "workspace", "First");
    await new Promise((r) => setTimeout(r, 5));
    const b = await svc.ensureSession(undefined, "live", "Second", { organisation: "Acme", permission: "HR email" });
    expect(svc.list().map((s) => s.id)).toEqual([b, a]);
    expect((await svc.remove(a)).map((s) => s.id)).toEqual([b]);
    expect(await svc.remove("all")).toEqual([]);
    expect(store.read().sessions).toEqual([]);
  });

  it("keeps one job description, caps its size, and clears it", async () => {
    const { store, account } = offline();
    const jds = new JobDescriptionService(store, account);
    expect(jds.get()).toBeNull();
    await jds.save("jd.pdf", "a".repeat(MAX_JD_CHARS + 500));
    expect(jds.get()).toMatchObject({ fileName: "jd.pdf" });
    expect(jds.get()!.text).toHaveLength(MAX_JD_CHARS);
    await jds.save("jd2.docx", "Needs Python");
    expect(jds.get()).toMatchObject({ fileName: "jd2.docx", text: "Needs Python" });
    await jds.clear();
    expect(jds.get()).toBeNull();
  });
});
