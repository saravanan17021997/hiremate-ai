-- HireMate AI database schema (Phase 2B).
-- Every table belongs to one user and is protected by Row Level Security:
-- a signed-in user can read and change only their own rows. Anonymous users get nothing.
-- Safe to run more than once.

-- gen_random_uuid() is built into PostgreSQL 13+, no extension needed.

-- Keeps updated_at current on every change.
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Candidate profile (one row per user) ----------
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  professional_summary text not null default '' check (char_length(professional_summary) <= 4000),
  total_experience_years numeric(4, 1) check (total_experience_years between 0 and 60),
  current_designation text not null default '' check (char_length(current_designation) <= 120),
  technical_skills text[] not null default '{}' check (cardinality(technical_skills) <= 100),
  education jsonb not null default '[]' check (jsonb_typeof(education) = 'array'),
  employment jsonb not null default '[]' check (jsonb_typeof(employment) = 'array'),
  achievements text[] not null default '{}' check (cardinality(achievements) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Uploaded resumes and what was extracted from them ----------
create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 255),
  file_type text not null check (file_type in ('pdf', 'docx')),
  file_size integer not null check (file_size > 0 and file_size <= 10485760), -- 10 MB
  extracted_text text check (char_length(extracted_text) <= 200000),
  extraction jsonb,
  parsed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Project knowledge base ----------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  technologies text[] not null default '{}' check (cardinality(technologies) <= 60),
  responsibilities text not null default '' check (char_length(responsibilities) <= 4000),
  challenges text not null default '' check (char_length(challenges) <= 4000),
  solutions text not null default '' check (char_length(solutions) <= 4000),
  business_impact text not null default '' check (char_length(business_impact) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Practice sessions (AI Interview workspace or mock interview) ----------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('workspace', 'mock')),
  title text not null default 'Practice session' check (char_length(title) between 1 and 200),
  job_role text check (char_length(job_role) <= 120),
  experience_level text check (char_length(experience_level) <= 60),
  interview_type text check (interview_type in ('technical', 'hr')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (id, user_id) -- lets session_items prove they belong to the same user
);

create table if not exists public.session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null default auth.uid(),
  position integer not null default 0 check (position >= 0),
  question text not null check (char_length(question) between 1 and 4000),
  suggested_answer text check (char_length(suggested_answer) <= 20000),
  candidate_answer text check (char_length(candidate_answer) <= 20000),
  feedback text check (char_length(feedback) <= 20000),
  score smallint check (score between 0 and 10),
  created_at timestamptz not null default now(),
  -- An item can only point at a session owned by the same user.
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade
);

create index if not exists resumes_user_idx on public.resumes (user_id, created_at desc);
create index if not exists projects_user_idx on public.projects (user_id);
create index if not exists sessions_user_idx on public.sessions (user_id, started_at desc);
create index if not exists session_items_session_idx on public.session_items (session_id, position);
create index if not exists session_items_user_idx on public.session_items (user_id);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();

-- ---------- Row Level Security ----------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'resumes', 'projects', 'sessions', 'session_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end $$;

-- ---------- Dashboard numbers in one call ----------
-- SECURITY INVOKER: runs as the caller, so RLS limits it to the caller's own rows.
create or replace function public.dashboard_summary() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'user_id' - 'created_at' - 'updated_at' from public.profiles p where p.user_id = auth.uid()),
    'sessions', (select count(*) from public.sessions),
    'mock_interviews', (select count(*) from public.sessions where kind = 'mock'),
    'questions_answered', (select count(*) from public.session_items),
    'resume_parsed', exists (select 1 from public.resumes where parsed_at is not null),
    'projects', (select count(*) from public.projects),
    'recent', coalesce((
      select jsonb_agg(r order by r.started_at desc)
      from (
        select s.id, s.kind, s.title, s.started_at,
               (select count(*) from public.session_items i where i.session_id = s.id) as question_count
        from public.sessions s
        order by s.started_at desc
        limit 5
      ) r
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.dashboard_summary() from public, anon;
grant execute on function public.dashboard_summary() to authenticated;
