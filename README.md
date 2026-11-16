# HireMate AI

AI-powered interview preparation for Windows. Electron + React + TypeScript + Tailwind.
See `docs/ARCHITECTURE.md` for the design, security model and phase plan.

**Current phase: 2B done** — app shell, security baseline, Dashboard, Settings with AI providers (OpenAI or Claude
key, checked and stored encrypted, model choice, streamed test), and optional Supabase sign-in with cloud sync.
Other modules show "Not built yet".

## Connect an AI provider

1. Run the app, open **Settings**.
2. Paste a key and click **Save and test**. Free, no card: Google Gemini (`AIza...`, aistudio.google.com/apikey)
   or Groq (`gsk_...`, console.groq.com/keys). Paid: OpenAI (`sk-...`) or Claude (`sk-ant-...`).
   The key is checked with the provider and saved only if it works.
3. Pick a model, then try **Test the connection**. The answer streams in.

## Requirements

- Windows 10/11, Node.js 20 or newer, Git

## Run in development

```powershell
npm install
npm run dev
```

The app window opens with hot reload. Your local data file is shown on the Dashboard (Privacy panel).

## Turn on cloud sync (Supabase, optional)

The app works fully offline. To let users sign in and sync:

1. Create a Supabase project. In **SQL Editor**, paste and run `supabase/migrations/20261104000001_hiremate_schema.sql`.
2. Copy `.env.example` to `.env` and fill in the **Project URL** and the **anon public** key
   (Project Settings → API; anon key is on the "Legacy API keys" tab). Never the service_role key.
3. Restart `npm run dev`. Settings → **Account and sync** now shows Sign in / Create account.
4. Supabase sends a confirmation email on sign-up (Authentication → Sign In / Providers → "Confirm email").
   Click the link, then sign in in the app.

## Other commands

| Command | What it does |
|---|---|
| `npm test` | 50 tests: data store, dashboard, keys, OpenAI/Claude adapters, AI service, sign-in, and the database schema + RLS (PGlite) |
| `npm run typecheck` | TypeScript checks for main, preload and UI |
| `npm run build` | Typecheck + production build into `out/` |
| `npm start` | Run the production build |
| `npm run dist:win` | Windows installer into `release/` (finalised in Phase 9) |

## Project structure

```
hiremate-ai/
├── electron.vite.config.ts     main / preload / renderer builds
├── electron-builder.yml        Windows NSIS installer settings
├── .env.example                Supabase URL + anon key (public values)
├── supabase/migrations/        database schema with RLS; supabase/tests/ checks it
├── docs/ARCHITECTURE.md
└── src/
    ├── shared/                 plain types and logic used by every process
    │   ├── types.ts            DashboardSummary, CandidateProfile, ...
    │   ├── ipc.ts              channel names + result type
    │   ├── api.ts              shape of window.hiremate
    │   └── profile.ts (+test)  profile completion %
    ├── main/                   Node: the app's secure backend
    │   ├── index.ts            window + startup
    │   ├── security.ts         CSP, permissions, navigation guards, trusted-URL check
    │   ├── ipc/register.ts     validated IPC handler helper
    │   ├── ipc/handlers.ts     all handlers + streaming
    │   ├── ai/                 provider interface, OpenAI + Claude adapters, AI service (+tests)
    │   ├── secrets/            encrypted key storage (safeStorage)
    │   ├── cloud/              Supabase config check + sign-in (+tests)
    │   └── data/               local store (+test), dashboard service
    ├── preload/index.ts        contextBridge → window.hiremate
    └── renderer/               React UI
        └── src/
            ├── App.tsx         layout + routes
            ├── components/     Sidebar, Logo, PageHeader
            ├── pages/          Dashboard, Settings, PlannedModule
            └── lib/            navigation map, useIpc hook
```
