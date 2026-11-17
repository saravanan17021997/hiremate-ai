-- ============================================================================================
-- SD HireMate AI — "Phone screen" (v1.1). Run this once in Supabase → SQL Editor if you already ran
-- hiremate_setup.sql before v1.1. (It is also included at the end of hiremate_setup.sql.)
-- Safe to run more than once. Touches only the "hiremate" schema, and adds this one table to
-- Supabase's realtime publication so your phone gets updates instantly.
--
-- One row per user: the laptop's live session writes the latest question and suggested reply,
-- your phone (signed in to the same account) reads it, and the phone's button presses
-- (Short / Medium / Detailed / Regenerate) go back to the laptop. Row Level Security: only you.
-- Nothing here stores meeting audio.
-- ============================================================================================

create table if not exists hiremate.live_feed (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  active boolean not null default false,              -- a live session is running on the laptop
  session_id uuid,
  rev bigint not null default 0,                      -- grows with every laptop update: older updates are ignored
  seq integer not null default 0 check (seq >= 0),    -- question number in this session
  state jsonb not null default '{}' check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 40000),
  request jsonb check (request is null or (jsonb_typeof(request) = 'object' and octet_length(request::text) <= 1000)),
  laptop_seen_at timestamptz,
  viewer_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists live_feed_updated_at on hiremate.live_feed;
create trigger live_feed_updated_at before update on hiremate.live_feed for each row execute function hiremate.set_updated_at();

alter table hiremate.live_feed enable row level security;
revoke all on hiremate.live_feed from anon;
grant select, insert, update, delete on hiremate.live_feed to authenticated;
drop policy if exists own_rows on hiremate.live_feed;
create policy own_rows on hiremate.live_feed for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Instant updates on the phone (Supabase Realtime). Realtime still applies the policy above,
-- so each person only receives their own row. If this step is skipped the phone still works,
-- it just checks for updates every second instead.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'hiremate' and tablename = 'live_feed') then
    execute 'alter publication supabase_realtime add table hiremate.live_feed';
  end if;
end $$;
