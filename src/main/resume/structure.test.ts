import { describe, expect, it } from "vitest";
import { ExtractionError, parseExtraction, structureResume } from "./structure";

const good = {
  profile: {
    fullName: "Priya Raman", professionalSummary: "Backend engineer.", totalExperienceYears: 4, currentDesignation: "Software Engineer",
    technicalSkills: ["Node.js", "PostgreSQL", ""], education: [{ degree: "B.E.", institution: "Anna University", years: "2016 - 2020" }],
    employment: [{ role: "Software Engineer", company: "Acme Pay", years: "2021 - Present" }], achievements: ["Cut manual checks by 70%"],
  },
  projects: [{ name: "Reconciliation service", description: "Matches payments", technologies: ["Node.js"] }, { name: "", description: "x", technologies: [] }],
};

describe("parseExtraction", () => {
  it("reads JSON inside code fences and drops empty items", () => {
    const r = parseExtraction("Here you go:\n```json\n" + JSON.stringify(good) + "\n```");
    expect(r.profile.fullName).toBe("Priya Raman");
    expect(r.profile.technicalSkills).toEqual(["Node.js", "PostgreSQL"]);
    expect(r.projects).toHaveLength(1);
  });
  it("fills gaps instead of failing when the AI leaves fields out or uses odd types", () => {
    const r = parseExtraction(JSON.stringify({ profile: { fullName: "A", totalExperienceYears: "5", technicalSkills: "not a list" } }));
    expect(r.profile).toMatchObject({ fullName: "A", totalExperienceYears: 5, technicalSkills: [], education: [], professionalSummary: "" });
    expect(r.projects).toEqual([]);
  });
  it("turns an impossible experience value into null", () => {
    expect(parseExtraction(JSON.stringify({ profile: { totalExperienceYears: 400 } })).profile.totalExperienceYears).toBeNull();
  });
  it("rejects replies with no JSON", () => {
    expect(() => parseExtraction("Sorry, I can't help")).toThrow(ExtractionError);
    expect(() => parseExtraction("{ broken json ")).toThrow(ExtractionError);
  });
});

describe("structureResume", () => {
  it("sends the resume as data and returns the profile", async () => {
    let sent: { system?: string; content?: string } = {};
    const r = await structureResume(async (o) => {
      sent = { system: o.system, content: o.messages[0].content };
      o.onDelta(JSON.stringify(good).slice(0, 50));
      o.onDelta(JSON.stringify(good).slice(50));
    }, "Priya Raman resume text");
    expect(r.profile.employment[0].company).toBe("Acme Pay");
    expect(sent.content).toBe("<resume>\nPriya Raman resume text\n</resume>");
    expect(sent.system).toMatch(/Never invent/);
  });
  it("retries once when the first reply can't be parsed", async () => {
    let calls = 0;
    const r = await structureResume(async (o) => {
      calls++;
      o.onDelta(calls === 1 ? "I think the profile is..." : JSON.stringify(good));
    }, "text");
    expect(calls).toBe(2);
    expect(r.profile.fullName).toBe("Priya Raman");
  });
  it("gives up after the retry", async () => {
    await expect(structureResume(async (o) => o.onDelta("no json"), "text")).rejects.toThrow(ExtractionError);
  });
});
