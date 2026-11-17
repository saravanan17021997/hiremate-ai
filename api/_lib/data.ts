// Reads the signed-in user's background and saves answers, through row-level security
// (the database only ever returns or changes this user's own rows).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateProfile, Project } from "../../src/shared/types";
import { profileFromRow } from "../../src/main/data/remoteSummary";

type ProjectRow = {
  id: string; name: string; description: string; technologies: string[] | null; responsibilities: string;
  challenges: string; solutions: string; business_impact: string; updated_at: string;
};

export const projectFromRow = (r: ProjectRow): Project => ({
  id: r.id, name: r.name, description: r.description, technologies: r.technologies ?? [], responsibilities: r.responsibilities,
  challenges: r.challenges, solutions: r.solutions, businessImpact: r.business_impact, updatedAt: r.updated_at,
});

export async function loadBackground(db: SupabaseClient<any, any, any>, userId: string) {
  const [p, pr, jd] = await Promise.all([
    db.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    db.from("projects").select("*").order("updated_at", { ascending: false }),
    db.from("job_descriptions").select("text").order("created_at", { ascending: false }).limit(1),
  ]);
  if (p.error) throw new Error(`Couldn't load your profile: ${p.error.message}`);
  if (pr.error) throw new Error(`Couldn't load your projects: ${pr.error.message}`);
  const profile: CandidateProfile | null = profileFromRow(p.data as never);
  return {
    profile,
    projects: ((pr.data ?? []) as ProjectRow[]).map(projectFromRow),
    jobDescription: jd.error ? "" : ((jd.data?.[0] as { text?: string } | undefined)?.text ?? ""),
  };
}

export type Item = { id: string; position: number; question: string; answer: string; createdAt: string };

export async function sessionItems(db: SupabaseClient<any, any, any>, sessionId: string): Promise<Item[]> {
  const { data, error } = await db.from("session_items").select("id, position, question, suggested_answer, created_at").eq("session_id", sessionId).order("position");
  if (error) throw new Error(`Couldn't load this session: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id, position: r.position, question: r.question, answer: r.suggested_answer ?? "", createdAt: r.created_at }));
}

/** Same rules as the desktop app: Regenerate, or a question completed after a short pause, replaces the last answer. */
export async function saveItem(db: SupabaseClient<any, any, any>, sessionId: string, items: Item[], question: string, answer: string, regenerate: boolean) {
  const last = items[items.length - 1];
  const completesLast = Boolean(last && question.length > last.question.length && question.startsWith(last.question) && Date.now() - Date.parse(last.createdAt) < 30_000);
  if (last && ((regenerate && last.question === question) || completesLast)) {
    const { error } = await db.from("session_items").update({ question: question.slice(0, 4000), suggested_answer: answer.slice(0, 20000) }).eq("id", last.id);
    if (error) throw error;
    return;
  }
  const { error } = await db.from("session_items").insert({ session_id: sessionId, position: items.length, question: question.slice(0, 4000), suggested_answer: answer.slice(0, 20000) });
  if (error) throw error;
}
