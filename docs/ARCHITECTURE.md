# HireMate AI — Architecture

HireMate AI is a Windows desktop app that helps candidates prepare for interviews: resume intelligence,
a project knowledge base, an AI answer workspace, mock interviews with feedback, and searchable history.
It is transparent by design: no stealth capture, no hidden overlays, no proctoring bypass, and the
microphone is used only after explicit consent in the app.

## 1. Requirements analysis

| Area | Requirement | Design decision |
|---|---|---|
| Platform | Windows desktop, installer | Electron 37 + electron-vite; electron-builder NSIS `.exe` (built on Windows or a GitHub Actions Windows runner) |
| UI | Premium dark glass UI, 7 modules, collapsible sidebar | React 18 + TypeScript + Tailwind v4 + Framer Motion + Lucide; HashRouter (works from `file://`) |
| AI | OpenAI first, streaming, provider-independent | `AIProvider` interface in the main process (`src/main/ai`); Gemini, Groq and OpenAI share one OpenAI-compatible adapter, plus a Claude adapter; streamed to the UI over IPC events |
| Keys | Never in frontend code | Keys live only in the main process, encrypted with Electron `safeStorage` (Windows DPAPI); the UI only sees "configured: yes/no" |
| Data | Supabase Auth + PostgreSQL + RLS | Supabase client runs in the main process; every table has `user_id` + RLS `auth.uid() = user_id`; local file until the user signs in |
| Documents | PDF and DOCX parsing | Main process: type/size/magic-byte validation, text extraction (pdf.js / mammoth), then AI structured extraction into an editable form |
| Speech | Consent-based, real-time where supported | Explicit consent dialog → microphone permission granted for that session only → streaming speech-to-text through the main process |
| No fake data | Completed features must be real | Dashboard reads real stored data; unbuilt modules say "Not built yet" with their phase |

## 2. Process model

```
┌──────────────────────────── Renderer (React UI) ────────────────────────────┐
│ No Node, no network (CSP connect-src 'self'), no ipcRenderer.               │
│ Calls only window.hiremate.* (typed API)                                    │
└───────────────▲─────────────────────────────────────────────────────────────┘
                │ contextBridge (preload, sandboxed)
┌───────────────┴──────────────── Main process (Node) ────────────────────────┐
│ IPC handlers: sender check + zod input validation + {ok,error} results      │
│ Services: data store · AI providers · document parsing · secrets · speech   │
└───────┬──────────────────────┬─────────────────────────┬────────────────────┘
        │ HTTPS                │ HTTPS                   │ disk
   Supabase (Auth, DB, RLS)   AI provider (OpenAI…)    %APPDATA%\HireMate AI
```

Why the main process is the backend: it is the only place that can hold secrets on a desktop app.
The page loads no remote code and cannot make network requests, so even an XSS bug in the UI
cannot read keys or send data anywhere.

## 3. Security

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Content Security Policy as a response header and a meta tag: own files only, no remote scripts, no network from the UI.
- Every IPC channel: sender URL must be the app's own page; input validated with zod; errors returned, never thrown into the UI.
- All browser permissions denied by default (`setPermissionRequestHandler`). Phase 6 allows `media` (audio only) after in-app consent.
- No new windows, no navigation away from the app, no `<webview>`; https links open in the user's browser.
- Single instance lock. Local data written atomically and validated on load; a corrupted file is moved aside, not silently lost.
- Uploads (Phase 3): extension + MIME + magic bytes + size limit; parsed in the main process only.
- Supabase (Phase 2): RLS on every table; the anon key is public by design, the service-role key is never used in the app.

## 4. Data model (Supabase, `supabase/hiremate_setup.sql`, all in the `hiremate` schema)

| Table | Purpose |
|---|---|
| `profiles` | Name, summary, experience, designation, skills, education, employment, achievements |
| `resumes` | Uploaded file metadata, extracted text, extraction JSON, parsed_at |
| `projects` | Name, description, technologies, responsibilities, challenges, solutions, impact |
| `sessions` | AI Interview / mock interview sessions (kind, role, level, started_at) |
| `session_items` | Question, answer suggestion, the candidate's answer, feedback, score |

Every table: `user_id uuid references auth.users` (filled in automatically), RLS `using/with check (user_id = auth.uid())`,
no access for `anon`, length and value checks on every text field. `session_items` can only point at a session of
the same user (composite foreign key). `dashboard_summary()` returns all dashboard numbers in one call and runs as the
caller, so RLS applies. Tested in `supabase/tests/schema.test.ts` (PGlite + Auth stand-in).

Sign-in runs in the main process with supabase-js; its session is stored through `SecretStore` (encrypted). The build
reads `MAIN_VITE_SUPABASE_URL` / `MAIN_VITE_SUPABASE_ANON_KEY` from `.env`; a secret or service-role key is refused.

## 5. Phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, Electron + React + TS scaffold, security baseline, typed IPC, app shell, Dashboard | **Done** |
| 2A | Settings: AI providers (OpenAI, Claude), key check + encrypted storage, model choice, streamed test | **Done** |
| 2B | Supabase email sign-in (tokens encrypted in main), schema + RLS migration, dashboard from Supabase when signed in | **Done** |
| 3 | Resume Intelligence: upload, validate, extract, AI structuring, review + edit, My Profile (saved to Supabase when signed in) | Next |
| 4 | Project Knowledge Base (CRUD) | |
| 5 | AI Interview Workspace: manual questions, streaming short/detailed answers, examples, follow-ups, copy | |
| 6 | Consent-based live transcription and question detection | |
| 7 | Mock Interview: role/level/type, one-by-one questions, text or voice answers, evaluation + feedback | |
| 8 | Interview History: search, review, export notes | |
| 9 | Packaging: Windows installer, app icon, CI build, setup and deployment docs | |

## 6. AI provider flow (Phase 2A)

1. The user pastes a key in Settings. It goes once, over IPC, to the main process.
2. The main process checks the format, then calls the provider's model list with it. A key the provider rejects is never saved.
3. A working key is encrypted with `safeStorage` (DPAPI on Windows) into `secrets.bin.json`; only the last 4 characters are ever shown.
4. Requests: the UI asks for a stream → main decrypts the key, calls the provider, and pushes `ai:stream` events
   (`delta` / `done` / `error`) tagged with a request id. The UI can cancel by id.
5. Development only: `HIREMATE_OPENAI_BASE_URL` / `HIREMATE_ANTHROPIC_BASE_URL` point at a local test server, and
   `HIREMATE_E2E=1` allows Linux test machines without a keyring to run. Both are ignored in the installed app.


## Phone screen (v1.1)

- **Why the laptop listens:** mobile browsers can't share tab or app audio, and Android/iOS don't let any app
  capture call audio (Meet/Teams use the voice-communication audio usage, which playback capture excludes; the
  microphone is given only to the call app during a call). So a meeting's remote voices are captured on the laptop.
- **Relay:** one row per user in `hiremate.live_feed` (RLS: own row only). The laptop's Live Assistant upserts the
  floating-panel state plus `seq` (question number), `requestId` (the answer request) and `rev` (always growing),
  throttled to one write per 150 ms and sent in order; new questions and status changes go immediately.
- **Phone:** subscribes to its row with Supabase Realtime (`postgres_changes`, filter `user_id=eq.<uid>`) and also
  reads it every 3 s (every 1 s while Realtime is down or reconnecting). An update with a lower `rev` is ignored,
  so a late update can never replace newer text, and question + answer always come from the same row version.
- **Buttons:** the phone writes `request = {id, action, seq}`; the laptop carries it out. A Regenerate pressed for
  an older question number is ignored; a length choice for an older question only changes the setting.
- **Presence:** `laptop_seen_at` / `viewer_seen_at` heartbeats show "Laptop connected" / "Phone screen connected".
- **Phone microphone mode:** on phones the Live Assistant uses `getUserMedia` (phone or Bluetooth headset mic,
  voice-tuned). Track `ended` (headset gone) → continues on the phone microphone and switches back on
  `devicechange`; track `mute` (the OS took the mic, e.g. a call) → "Audio unavailable".
