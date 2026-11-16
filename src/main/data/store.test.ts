import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_STORE, LocalStore } from "./localStore";
import { buildDashboardSummary } from "./dashboardService";

const tempStore = () => LocalStore.inFolder(mkdtempSync(join(tmpdir(), "hiremate-")));

describe("LocalStore", () => {
  it("returns an empty store for a new user", () => expect(tempStore().read()).toEqual(EMPTY_STORE));

  it("reads an older file (Phase 1 projects had only id + name) and fills the new fields", () => {
    const store = tempStore();
    writeFileSync(store.path, JSON.stringify({ version: 1, profile: null, resumeParsedAt: null, projects: [{ id: "p1", name: "SaraDev POS" }], sessions: [] }));
    const data = store.read();
    expect(data.projects[0]).toMatchObject({ name: "SaraDev POS", description: "", technologies: [] });
    expect(data.resumeProjects).toEqual([]);
    expect(data.settings.aiProvider).toBeNull();
  });

  it("refuses to save invalid data", () => {
    const store = tempStore();
    expect(() => store.write({ ...EMPTY_STORE, version: 2 } as never)).toThrow();
  });

  it("moves a corrupted file aside and starts fresh", () => {
    const store = tempStore();
    writeFileSync(store.path, "{not json", "utf8");
    expect(store.read()).toEqual(EMPTY_STORE);
    const folder = store.path.replace(/hiremate-data\.json$/, "");
    expect(readdirSync(folder).some((f) => f.includes(".corrupt-"))).toBe(true);
  });

  it("writes valid JSON", () => {
    const store = tempStore();
    store.write(EMPTY_STORE);
    expect(JSON.parse(readFileSync(store.path, "utf8")).version).toBe(1);
  });
});

describe("buildDashboardSummary", () => {
  it("shows zeros and an unfinished setup for a new user", () => {
    const s = buildDashboardSummary(EMPTY_STORE, false);
    expect(s.stats).toEqual({ sessions: 0, questionsAnswered: 0, mockInterviews: 0, resumeCompletion: 0 });
    expect(s.setup).toEqual({ profile: false, resume: false, aiProvider: false, projects: false });
    expect(s.candidateName).toBeNull();
  });

  it("counts sessions, questions and mock interviews, newest first", () => {
    const q = { question: "Q", answer: "A", askedAt: "2026-11-01T10:00:00Z" };
    const s = buildDashboardSummary(
      {
        ...EMPTY_STORE,
        sessions: [
          { id: "a", kind: "workspace", title: "Older", startedAt: "2026-10-01T10:00:00Z", questions: [q, q] },
          { id: "b", kind: "mock", title: "Newer", startedAt: "2026-11-01T10:00:00Z", questions: [q] },
        ],
      },
      true,
    );
    expect(s.stats.sessions).toBe(2);
    expect(s.stats.questionsAnswered).toBe(3);
    expect(s.stats.mockInterviews).toBe(1);
    expect(s.recentSessions.map((r) => r.title)).toEqual(["Newer", "Older"]);
    expect(s.setup.aiProvider).toBe(true);
  });
});
