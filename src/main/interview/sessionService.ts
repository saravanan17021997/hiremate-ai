// Practice sessions: each question and answer is kept on this PC, and in Supabase when signed in.
import { randomUUID } from "node:crypto";
import type { LocalStore } from "../data/localStore";
import type { AccountService } from "../cloud/account";

export class SessionService {
  constructor(private readonly store: LocalStore, private readonly account: AccountService) {}

  private async signedInClient() {
    if (!this.account.client) return null;
    const { data } = await this.account.client.auth.getSession();
    return data.session ? this.account.client : null;
  }

  /** Returns an existing session id, or creates a new session titled after the first question. */
  /** Account copies still being created, so their questions are added after them. */
  private readonly syncing = new Map<string, Promise<void>>();

  async ensureSession(
    sessionId: string | undefined,
    kind: "workspace" | "mock" | "live",
    firstQuestion: string,
    consent?: { organisation: string; permission: string },
  ): Promise<string> {
    const data = this.store.read();
    if (sessionId && data.sessions.some((s) => s.id === sessionId)) return sessionId;
    const id = randomUUID();
    const title = firstQuestion.length > 80 ? `${firstQuestion.slice(0, 77)}…` : firstQuestion;
    const startedAt = new Date().toISOString();
    data.sessions.push({ id, kind, title, startedAt, questions: [], ...(consent ? { consent: { ...consent, confirmedAt: startedAt } } : {}) });
    this.store.write(data);
    // Copy to the account in the background: the first answer never waits for the network.
    this.syncing.set(id, (async () => {
      const client = await this.signedInClient();
      if (!client) return;
      const { error } = await client.from("sessions").insert({
        id, kind, title, started_at: startedAt,
        ...(consent ? { consent_organisation: consent.organisation, consent_permission: consent.permission, consent_at: startedAt } : {}),
      });
      if (error) console.warn("[sessions] not synced:", error.message);
    })().catch((e: Error) => console.warn("[sessions] not synced:", e.message)));
    return id;
  }

  /** The last few questions and answers of a session, so follow-up questions have context. */
  recent(sessionId: string | undefined, max = 4): { question: string; answer: string }[] {
    if (!sessionId) return [];
    const s = this.store.read().sessions.find((x) => x.id === sessionId);
    return s ? s.questions.slice(-max).map(({ question, answer }) => ({ question, answer })) : [];
  }

  /** All sessions on this PC, newest first. */
  list() {
    return [...this.store.read().sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /** Deletes one session (or all) here and in Supabase. Questions and answers go with it. Audio is never stored. */
  async remove(sessionId: string | "all") {
    const data = this.store.read();
    data.sessions = sessionId === "all" ? [] : data.sessions.filter((s) => s.id !== sessionId);
    this.store.write(data);
    await Promise.all(sessionId === "all" ? [...this.syncing.values()] : [this.syncing.get(sessionId)]); // let a pending account copy finish first
    const client = await this.signedInClient();
    if (client) {
      const query = client.from("sessions").delete();
      const { error } = sessionId === "all" ? await query.neq("id", "00000000-0000-0000-0000-000000000000") : await query.eq("id", sessionId);
      if (error) throw new Error(`Deleted on this PC, but not from your account: ${error.message}`);
    }
    return this.list();
  }

  async end(sessionId: string) {
    const client = await this.signedInClient();
    if (client) await client.from("sessions").update({ ended_at: new Date().toISOString() }).eq("id", sessionId);
  }

  /** Saves a question and answer. `replaceLast` (Regenerate) swaps the previous answer to the same question. */
  async addItem(sessionId: string, question: string, answer: string, replaceLast = false) {
    const data = this.store.read();
    const session = data.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error("Session not found.");
    const askedAt = new Date().toISOString();
    const last = session.questions[session.questions.length - 1];
    // A question that was cut in two by a short pause: the full question replaces its first half.
    const completesLast = Boolean(last && question.length > last.question.length && question.startsWith(last.question) && Date.now() - Date.parse(last.askedAt) < 30_000);
    if ((replaceLast && last?.question === question) || completesLast) {
      if (last) last.question = question;
      last.answer = answer;
      last.askedAt = askedAt;
      this.store.write(data);
      await this.syncing.get(sessionId);
      const client = await this.signedInClient();
      if (client) {
        await client.from("session_items").update({ question, suggested_answer: answer.slice(0, 20000) }).eq("session_id", sessionId).eq("position", session.questions.length - 1);
      }
      return;
    }
    session.questions.push({ question, answer, askedAt });
    this.store.write(data);
    await this.syncing.get(sessionId);
    const client = await this.signedInClient();
    if (client) {
      const { error } = await client.from("session_items").insert({
        session_id: sessionId, position: session.questions.length - 1, question, suggested_answer: answer.slice(0, 20000),
      });
      if (error) console.warn("[sessions] item not synced:", error.message);
    }
  }
}
