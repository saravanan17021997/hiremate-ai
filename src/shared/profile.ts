// How complete the candidate's profile is, as a percentage. Pure function, unit-tested.
import type { CandidateProfile } from "./types";

const checks: ((p: CandidateProfile) => boolean)[] = [
  (p) => p.fullName.trim().length > 1,
  (p) => p.professionalSummary.trim().split(/\s+/).length >= 15,
  (p) => p.totalExperienceYears !== null && p.totalExperienceYears >= 0,
  (p) => p.currentDesignation.trim().length > 1,
  (p) => p.technicalSkills.filter((s) => s.trim()).length >= 3,
  (p) => p.education.length > 0,
  (p) => p.employment.length > 0,
  (p) => p.achievements.filter((a) => a.trim()).length > 0,
];

export function profileCompletion(profile: CandidateProfile | null): number {
  if (!profile) return 0;
  const passed = checks.filter((check) => check(profile)).length;
  return Math.round((passed / checks.length) * 100);
}
