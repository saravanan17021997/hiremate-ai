// Runs the real migration in an in-process PostgreSQL (PGlite) with a small stand-in for
// Supabase Auth, then checks that every user sees only their own data.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
let db: PGlite;

// Act as a signed-in user (or anonymous when id is null) for one block of SQL.
async function as<T>(id: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(id ? `set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);` : `set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}
const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Record<string, unknown>[];

beforeAll(async () => {
  db = new PGlite();
  // Minimal Supabase stand-ins: auth schema, users table, auth.uid(), and the two API roles.
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com');
  `);
  await db.exec(readFileSync("supabase/migrations/20261104000001_hiremate_schema.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261104000001_hiremate_schema.sql", "utf8")); // safe to run twice
});

describe("HireMate schema and RLS", () => {
  it("lets a user create and read their own profile; user_id fills in automatically", async () => {
    await as(ALICE, () => db.query(`insert into public.profiles (full_name, technical_skills, education) values ('Alice', '{n8n,React,SQL}', '[{"degree":"B.Com"}]')`));
    const mine = await as(ALICE, () => rows("select user_id, full_name from public.profiles"));
    expect(mine).toEqual([{ user_id: ALICE, full_name: "Alice" }]);
  });

  it("hides other users' rows", async () => {
    expect(await as(BOB, () => rows("select * from public.profiles"))).toEqual([]);
  });

  it("blocks writing a row for someone else", async () => {
    await expect(as(BOB, () => db.query(`insert into public.projects (user_id, name) values ('${ALICE}', 'Sneaky')`))).rejects.toThrow(/row-level security/);
  });

  it("blocks changing someone else's rows (0 rows affected)", async () => {
    const r = await as(BOB, () => db.query(`update public.profiles set full_name = 'Hacked'`));
    expect(r.affectedRows ?? 0).toBe(0);
    expect((await as(ALICE, () => rows("select full_name from public.profiles")))[0].full_name).toBe("Alice");
  });

  it("gives anonymous visitors no access at all", async () => {
    await expect(as(null, () => db.query("select * from public.profiles"))).rejects.toThrow(/permission denied/);
    await expect(as(null, () => db.query("select public.dashboard_summary()"))).rejects.toThrow(/permission denied/);
  });

  it("stops a session item pointing at another user's session", async () => {
    const [s] = await as(ALICE, () => rows(`insert into public.sessions (kind, title) values ('mock', 'Alice mock') returning id`));
    await expect(as(BOB, () => db.query(`insert into public.session_items (session_id, question) values ($1, 'Q?')`, [s.id]))).rejects.toThrow();
  });

  it("validates data: bad kind, empty question, oversize resume", async () => {
    await expect(as(ALICE, () => db.query(`insert into public.sessions (kind) values ('party')`))).rejects.toThrow(/check/);
    const [s] = await as(ALICE, () => rows(`select id from public.sessions limit 1`));
    await expect(as(ALICE, () => db.query(`insert into public.session_items (session_id, question) values ($1, '')`, [s.id]))).rejects.toThrow(/check/);
    await expect(as(ALICE, () => db.query(`insert into public.resumes (file_name, file_type, file_size) values ('cv.pdf', 'pdf', 20000000)`))).rejects.toThrow(/check/);
  });

  it("dashboard_summary counts only the caller's data", async () => {
    await as(ALICE, async () => {
      const [w] = await rows(`insert into public.sessions (kind, title, started_at) values ('workspace', 'Newest', now() + interval '1 hour') returning id`);
      await db.query(`insert into public.session_items (session_id, question, position) values ($1, 'Tell me about yourself', 0), ($1, 'Why this role?', 1)`, [w.id]);
      await db.query(`insert into public.projects (name) values ('SaraDev POS')`);
      await db.query(`insert into public.resumes (file_name, file_type, file_size, parsed_at) values ('cv.pdf', 'pdf', 50000, now())`);
    });
    await as(BOB, () => db.query(`insert into public.sessions (kind, title) values ('workspace', 'Bob only')`));

    const [{ s }] = await as(ALICE, () => rows("select public.dashboard_summary() as s")) as [{ s: Record<string, any> }];
    expect(s.sessions).toBe(2);
    expect(s.mock_interviews).toBe(1);
    expect(s.questions_answered).toBe(2);
    expect(s.projects).toBe(1);
    expect(s.resume_parsed).toBe(true);
    expect(s.profile.full_name).toBe("Alice");
    expect(s.recent.map((r: { title: string }) => r.title)).toEqual(["Newest", "Alice mock"]);
    expect(s.recent[0].question_count).toBe(2);

    const [{ s: bob }] = await as(BOB, () => rows("select public.dashboard_summary() as s")) as [{ s: Record<string, any> }];
    expect(bob).toMatchObject({ sessions: 1, questions_answered: 0, projects: 0, resume_parsed: false, profile: null });
  });

  it("live sessions must record who allowed AI assistance (migration 2)", async () => {
    await db.exec(readFileSync("supabase/migrations/20261104000002_live_sessions.sql", "utf8"));
    await expect(as(ALICE, () => db.query(`insert into public.sessions (kind, title) values ('live', 'No consent')`))).rejects.toThrow(/live_sessions_need_consent/);
    await as(ALICE, () => db.query(`insert into public.sessions (kind, title, consent_organisation, consent_permission, consent_at) values ('live', 'Live: Acme', 'Acme', 'HR email 4 Nov', now())`));
    const [{ n }] = await as(ALICE, () => rows(`select count(*)::int as n from public.sessions where kind = 'live'`));
    expect(n).toBe(1);
  });

  it("job descriptions are private, and deleting a session deletes its questions (migration 3)", async () => {
    const m3 = readFileSync("supabase/migrations/20261114000003_job_descriptions_and_deletes.sql", "utf8");
    await db.exec(m3);
    await db.exec(m3); // safe to run twice
    await as(ALICE, () => db.query(`insert into public.job_descriptions (file_name, text) values ('jd.pdf', 'Python, SQL')`));
    expect(await as(BOB, () => rows(`select * from public.job_descriptions`))).toEqual([]);
    await expect(as(BOB, () => db.query(`insert into public.job_descriptions (user_id, file_name, text) values ('${ALICE}', 'x', 'y')`))).rejects.toThrow();
    await expect(as(null, () => db.query(`select * from public.job_descriptions`))).rejects.toThrow();
    await expect(as(ALICE, () => db.query(`insert into public.job_descriptions (file_name, text) values ('x', '')`))).rejects.toThrow();
    const del = await as(BOB, () => db.query(`delete from public.job_descriptions`));
    expect(del.affectedRows).toBe(0);

    const [{ id }] = await as(ALICE, () => rows(`insert into public.sessions (kind, title) values ('workspace', 'To delete') returning id`));
    await as(ALICE, () => db.query(`insert into public.session_items (session_id, position, question, suggested_answer) values ($1, 0, 'Q?', 'A')`, [id]));
    expect((await as(BOB, () => db.query(`delete from public.sessions where id = $1`, [id]))).affectedRows).toBe(0);
    await as(ALICE, () => db.query(`delete from public.sessions where id = $1`, [id]));
    expect(await rows(`select count(*)::int as n from public.session_items where session_id = $1`, [id])).toEqual([{ n: 0 }]);
  });

  it("deleting a user removes all their data", async () => {
    await db.exec(`delete from auth.users where id = '${BOB}'`);
    expect(await rows(`select count(*)::int as n from public.sessions where user_id = '${BOB}'`)).toEqual([{ n: 0 }]);
  });
});
