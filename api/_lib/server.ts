// Shared helpers for the web version's server functions (Vercel). Secrets live only here, in
// environment variables: GROQ_API_KEY never reaches the browser.
import type { IncomingMessage, ServerResponse } from "node:http";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createGroq } from "../../src/main/ai/openai";
import { DB_SCHEMA } from "../../src/shared/types";

export type Req = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };
export type Res = ServerResponse;

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function env(name: string, ...fallbacks: string[]): string {
  for (const n of [name, ...fallbacks]) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return "";
}

export function sendJson(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/** Runs a handler and turns any error into a JSON message the screen can show. */
export function route(methods: string[], fn: (req: Req, res: Res) => Promise<void>) {
  return async (req: Req, res: Res) => {
    try {
      if (!methods.includes(req.method ?? "")) throw new HttpError(405, "Method not allowed.");
      await fn(req, res);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error("[api]", e);
      const message = e instanceof Error && e.message ? e.message : "Something went wrong.";
      if (!res.headersSent) sendJson(res, status, { error: message });
      else res.end();
    }
  };
}

/** The raw request body (Vercel may already have read it). */
export async function readBody(req: Req, maxBytes: number): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  if (req.body && typeof req.body === "object") return Buffer.from(JSON.stringify(req.body));
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new HttpError(413, `That file is too big (limit ${Math.round(maxBytes / 1048576)} MB).`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req: Req): Promise<unknown> {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = (await readBody(req, 1_000_000)).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, "The request wasn't valid JSON.");
  }
}

export function query(req: Req, name: string): string {
  const fromVercel = req.query?.[name];
  if (typeof fromVercel === "string") return fromVercel;
  return new URL(req.url ?? "/", "http://x").searchParams.get(name) ?? "";
}

// ---------- Who is calling ----------

/** Invited emails (ALLOWED_EMAILS, comma separated). Nobody gets in until the owner adds someone. */
export function invited(email: string | undefined): boolean {
  const list = env("ALLOWED_EMAILS").split(/[,\s;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  return Boolean(email) && list.includes(email!.toLowerCase());
}

const seen = new Map<string, { user: User; until: number }>();

/** Checks the Supabase sign-in token and the invite list. Returns a database client that acts as this user (row-level security applies). */
export async function requireUser(req: Req): Promise<{ user: User; db: SupabaseClient<any, any, any> }> {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  if (!url || !anon) throw new HttpError(500, "The server isn't set up yet: SUPABASE_URL and SUPABASE_ANON_KEY are missing.");
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "Please sign in.");
  const db = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: { schema: DB_SCHEMA }, // HireMate's own schema: never touches other apps' tables
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  let user = seen.get(token)?.until! > Date.now() ? seen.get(token)!.user : null;
  if (!user) {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new HttpError(401, "Your sign-in has expired. Please sign in again.");
    user = data.user;
    if (seen.size > 500) seen.clear();
    seen.set(token, { user, until: Date.now() + 60_000 });
  }
  if (!invited(user.email)) throw new HttpError(403, `${user.email ?? "This account"} isn't invited to this HireMate. Ask the owner to add your email.`);
  return { user, db };
}

// ---------- AI ----------

export const MODEL = () => env("GROQ_MODEL") || "openai/gpt-oss-20b";

export function groqKey(): string {
  const key = env("GROQ_API_KEY");
  if (!key) throw new HttpError(500, "The server isn't set up yet: GROQ_API_KEY is missing.");
  return key;
}

/** Groq chat. HIREMATE_GROQ_BASE_URL is only for local tests. */
export const groq = () => createGroq(env("HIREMATE_GROQ_BASE_URL") || undefined);
