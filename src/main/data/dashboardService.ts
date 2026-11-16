// Builds the dashboard numbers from real stored data. No sample data: a new user sees zeros.
import { profileCompletion } from "@shared/profile";
import type { DashboardSummary } from "@shared/types";
import type { StoreData } from "./localStore";

export function buildDashboardSummary(data: StoreData, aiProviderConfigured: boolean): DashboardSummary {
  const sessions = [...data.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const completion = profileCompletion(data.profile);
  return {
    candidateName: data.profile?.fullName.trim() || null,
    stats: {
      sessions: sessions.length,
      questionsAnswered: sessions.reduce((sum, s) => sum + s.questions.length, 0),
      mockInterviews: sessions.filter((s) => s.kind === "mock").length,
      resumeCompletion: completion,
    },
    recentSessions: sessions.slice(0, 5).map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      startedAt: s.startedAt,
      questionCount: s.questions.length,
    })),
    setup: {
      profile: completion >= 60,
      resume: data.resumeParsedAt !== null,
      aiProvider: aiProviderConfigured,
      projects: data.projects.length > 0,
    },
    dataSource: "local",
  };
}
