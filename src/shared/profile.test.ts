import { describe, expect, it } from "vitest";
import { profileCompletion } from "./profile";
import type { CandidateProfile } from "./types";

const empty: CandidateProfile = {
  fullName: "", professionalSummary: "", totalExperienceYears: null, currentDesignation: "",
  technicalSkills: [], education: [], employment: [], achievements: [],
};

describe("profileCompletion", () => {
  it("is 0 with no profile", () => expect(profileCompletion(null)).toBe(0));
  it("is 0 for an empty profile", () => expect(profileCompletion(empty)).toBe(0));
  it("counts each completed field", () => {
    expect(profileCompletion({ ...empty, fullName: "Saravanan R", technicalSkills: ["n8n", "Supabase", "React"] })).toBe(25);
  });
  it("needs 3 skills, not 2", () => expect(profileCompletion({ ...empty, technicalSkills: ["n8n", "React"] })).toBe(0));
  it("is 100 when everything is filled", () => {
    expect(
      profileCompletion({
        fullName: "Saravanan R",
        professionalSummary: "Automation engineer who builds integrations between ERP systems, databases and messaging tools for sales and finance teams.",
        totalExperienceYears: 8,
        currentDesignation: "Digital Transformation Lead",
        technicalSkills: ["n8n", "Supabase", "React"],
        education: [{ degree: "B.Com", institution: "University of Madras", years: "2014-2017" }],
        employment: [{ role: "Data Analyst", company: "Stats Perform", years: "2020-2025" }],
        achievements: ["Automated WhatsApp invoice delivery"],
      }),
    ).toBe(100);
  });
});
