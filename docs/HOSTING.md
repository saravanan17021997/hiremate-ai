# Hosting HireMate AI

Two ways to use HireMate:

| | Windows installer | Web version |
|---|---|---|
| How people get it | Download `HireMate-AI-Setup-x.y.z.exe` and install | Open your website in Chrome or Edge |
| AI key | Each person adds a free Groq key in Settings | **Your** Groq key, kept on the server |
| Who can use it | Anyone you give the installer to | Only emails you invite (`ALLOWED_EMAILS`) |
| Data | On that PC (optional Supabase sync) | Each person's own rows in your Supabase |
| Meeting audio | "Computer sound" | Share the Meet/Teams tab (or screen) with audio |
| Floating panel | Separate always-on-top window | Picture-in-picture window (Chrome/Edge) |

---

## A. Windows installer

### Install
1. Double-click `HireMate-AI-Setup-x.y.z.exe`.
2. If Windows shows **"Windows protected your PC"**, click **More info → Run anyway**. This appears because the
   installer isn't signed with a paid code-signing certificate.
3. Choose a folder, click **Install**. Shortcuts are added to the Desktop and Start Menu.
4. Open HireMate → **Settings → Groq** → paste a key (free at https://console.groq.com/keys).

Uninstall from **Windows Settings → Apps → HireMate AI**. Your profile and history stay in
`%APPDATA%\HireMate AI` unless you delete that folder.

### Build a new installer (on your Windows PC)
```powershell
npm install
npm run dist:win
```
The installer appears in `release\<version>\HireMate-AI-Setup-<version>.exe`.

---

## B. Web version on Vercel (free plans)

You need: a GitHub account, a Vercel account, a Supabase account (all free), and your Groq key.

### 1. Supabase (database and sign-in)
HireMate can share a Supabase project with your other apps: all its tables live in their own schema,
**`hiremate`**, so it never creates, changes or grants anything in `public`.

1. Open your Supabase project → **SQL Editor → New query**.
2. Paste the whole of **`supabase/hiremate_setup.sql`** and click **Run**. ("Success. No rows returned" is correct.)
3. **Project Settings → Data API → Exposed schemas**: add **`hiremate`** (keep `public` and anything already there) → **Save**.
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
   (Never use the `service_role` key anywhere in HireMate.)
5. After deploying (step 3 below): **Authentication → URL Configuration → Redirect URLs → Add URL** →
   `https://<your-vercel-address>/**`. This only *adds* an allowed address for confirmation emails; don't change
   **Site URL**, which your other apps use.

Note: sign-in accounts are shared across apps in the same Supabase project. That's safe here: only emails in
`ALLOWED_EMAILS` can use HireMate, and each app only sees its own tables.

### 2. GitHub
1. Create a **private** repository, e.g. `hiremate-ai`.
2. Upload the project folder (without `node_modules`, `out`, `release`, `.env`; `.gitignore` already skips them).
   With Git:
   ```powershell
   git init
   git add .
   git commit -m "HireMate AI"
   git branch -M main
   git remote add origin https://github.com/<you>/hiremate-ai.git
   git push -u origin main
   ```

### 3. Vercel
1. https://vercel.com → **Add New → Project** → import the `hiremate-ai` repository.
2. Leave the build settings as they are (`vercel.json` sets them).
3. **Environment Variables**: add these, then click **Deploy**:

| Name | Value |
|---|---|
| `GROQ_API_KEY` | your Groq key (`gsk_…`) |
| `GROQ_MODEL` | `openai/gpt-oss-20b` |
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_ANON_KEY` | Supabase anon public key |
| `VITE_SUPABASE_URL` | same Project URL |
| `VITE_SUPABASE_ANON_KEY` | same anon public key |
| `ALLOWED_EMAILS` | `you@gmail.com, friend1@gmail.com, friend2@gmail.com` |

4. When it finishes, open the address Vercel shows (e.g. `https://hiremate-ai-xxxx.vercel.app`).

### 4. Invite people
- Add their email to `ALLOWED_EMAILS` (Vercel → Project → Settings → Environment Variables), then
  **Deployments → ⋯ → Redeploy**. Changes to variables only apply after a redeploy.
- Send them the link. They click **Create account** with that email, confirm it from their inbox, and sign in.
- Anyone not on the list can create an account but sees "isn't invited" and can't use the AI.

### 5. Using the Live Assistant in the browser
1. Open HireMate in **Chrome or Edge** (the floating panel needs one of these).
2. Join the Google Meet or Teams call in another tab.
3. In HireMate: **Live Assistant** → fill in consent → **Start Live Assistant** → **Start listening**.
4. In the browser's share window, choose the **Meet/Teams tab** and turn on **Also share tab audio**
   (or choose **Entire screen** and turn on **Also share system audio**).
5. Click **Floating panel** for a small always-on-top window with the current question and answer.

### 6. Phone screen and phone microphone mode (v1.1)

**One-time setup (if you set up Supabase before v1.1):** Supabase → **SQL Editor → New query** → paste the whole
of **`supabase/hiremate_phone_screen.sql`** → **Run** ("Success. No rows returned" is correct). It adds one table,
`hiremate.live_feed`, in HireMate's own schema, and turns on instant updates for it. Nothing in `public` changes.
(New installs get it from `hiremate_setup.sql`.)

**Phone screen (Google Meet / Teams):**
1. On your **laptop**, open HireMate in Chrome or Edge → **Live Assistant** → start, and share the meeting tab with
   **Also share tab audio**, exactly as before.
2. On your **phone**, open `https://<your-site>/#/phone` (or tap **Phone** in the bottom bar) and sign in with the
   **same account**.
3. Each question appears on the phone as **Question #N** with its **Suggested reply #N**, as the laptop writes it.
   Short / Medium / Detailed / Regenerate on the phone are carried out by the laptop. The laptop shows
   **Phone screen connected** while the phone page is open.

The laptop does the listening: phones can't hear a call running on the phone itself (Android and iPhone keep call
sound private), so the meeting has to run on the laptop.

**Phone microphone mode:** open **Live** on the phone itself. It listens through the phone's microphone or a
Bluetooth headset's microphone (choose it in **Listen to**), so it hears speech near the phone: an in-person
conversation, or a call playing on another device's speaker. If the headset disconnects, it continues on the
phone microphone and switches back when the headset returns.

### Limits to know
- All web users share your Groq free-plan limit (about 8,000 tokens a minute for gpt-oss models).
  If it's reached, HireMate waits a few seconds and retries, or says so.
- Uploads (resume, job description) are limited to 4 MB on the web version.

### Try the web version on your PC first (optional)
Create `.env` from `.env.example` with your values, then:
```powershell
npm run dev:web
```
Open http://localhost:5199.
