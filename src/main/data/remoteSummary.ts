// Converts the JSON from the dashboard_summary() database function into the dashboard shape.
import { profileCompletion } from "../../shared/profile"; // relative: also used by the web version
import type { CandidateProfile, DashboardSummary } from "@shared/types";

type Remote = {
  profile: null | {
    full_name: string; professional_summary: string; total_experience_years: number | string | null; current_designation: string;
    technical_skills: string[]; education: CandidateProfile["education"]; employment: CandidateProfile["employment"]; achievements: string[];
  };
  sessions: number; mock_interviews: number; questions_answered: number; resume_parsed: boolean; projects: number;
  recent: { id: string; kind: "workspace" | "mock" | "live"; title: string; started_at: string; question_count: number }[];
};

export function profileFromRow(row: Remote["profile"]): CandidateProfile | null {
  if (!row) return null;
  return {
    fullName: row.full_name ?? "",
    professionalSummary: row.professional_summary ?? "",
    totalExperienceYears: row.total_experience_years === null || row.total_experience_years === undefined ? null : Number(row.total_experience_years),
    currentDesignation: row.current_designation ?? "",
    technicalSkills: row.technical_skills ?? [],
    education: row.education ?? [],
    employment: row.employment ?? [],
    achievements: row.achievements ?? [],
  };
}

export function mapRemoteSummary(raw: unknown, aiReady: boolean): DashboardSummary {
  const r = raw as Remote;
  const profile = profileFromRow(r.profile);
  const completion = profileCompletion(profile);
  return {
    candidateName: profile?.fullName.trim() || null,
    stats: {
      sessions: Number(r.sessions ?? 0),
      questionsAnswered: Number(r.questions_answered ?? 0),
      mockInterviews: Number(r.mock_interviews ?? 0),
      resumeCompletion: completion,
    },
    recentSessions: (r.recent ?? []).map((s) => ({ id: s.id, kind: s.kind, title: s.title, startedAt: s.started_at, questionCount: Number(s.question_count) })),
    setup: { profile: completion >= 60, resume: Boolean(r.resume_parsed), aiProvider: aiReady, projects: Number(r.projects ?? 0) > 0 },
    dataSource: "supabase",
  };
}
