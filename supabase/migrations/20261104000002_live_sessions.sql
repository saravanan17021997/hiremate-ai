-- Phase 6: live assistant sessions, used only where the employer has allowed AI assistance.
-- Each live session records which organisation allowed it and how. Safe to run more than once.

alter table public.sessions drop constraint if exists sessions_kind_check;
alter table public.sessions add constraint sessions_kind_check check (kind in ('workspace', 'mock', 'live'));

alter table public.sessions add column if not exists consent_organisation text check (char_length(consent_organisation) <= 200);
alter table public.sessions add column if not exists consent_permission text check (char_length(consent_permission) <= 500);
alter table public.sessions add column if not exists consent_at timestamptz;

-- A live session must say who allowed it.
alter table public.sessions drop constraint if exists live_sessions_need_consent;
alter table public.sessions add constraint live_sessions_need_consent
  check (kind <> 'live' or (consent_organisation is not null and consent_permission is not null and consent_at is not null));
