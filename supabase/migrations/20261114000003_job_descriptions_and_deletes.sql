-- Phase 6b: job descriptions as answer context. One row per upload, only the owner can see or change it.
-- Safe to run more than once.

create table if not exists public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 255),
  text text not null check (char_length(text) between 1 and 12000),
  created_at timestamptz not null default now()
);
create index if not exists job_descriptions_user_idx on public.job_descriptions (user_id, created_at desc);

alter table public.job_descriptions enable row level security;
revoke all on public.job_descriptions from anon;
grant select, insert, delete on public.job_descriptions to authenticated;
drop policy if exists own_rows on public.job_descriptions;
create policy own_rows on public.job_descriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Deleting a session already deletes its questions and answers (session_items cascade).
