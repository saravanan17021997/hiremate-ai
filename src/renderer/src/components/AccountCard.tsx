// Account and sync: Supabase sign-in / sign-up / sign-out.
// The password goes once to the main process; tokens stay there, encrypted.
import { CheckCircle2, CloudOff, Loader2, LogOut, Mail, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AccountStatus } from "@shared/types";
import { useIpc } from "../lib/useIpc";

export function AccountCard() {
  const getStatus = useCallback(() => window.hiremate.account.getStatus(), []);
  const { data, error: loadError } = useIpc(getStatus);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  useEffect(() => setStatus(data), [data]);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === "signin") {
      const r = await window.hiremate.account.signIn(email, password);
      if (r.ok) setStatus(r.data);
      else setError(r.error);
    } else {
      const r = await window.hiremate.account.signUp(email, password);
      if (!r.ok) setError(r.error);
      else {
        setStatus(r.data.status);
        if (r.data.needsEmailConfirmation) {
          setNotice(`We sent a confirmation link to ${email}. Open it, then sign in here.`);
          setMode("signin");
        }
      }
    }
    setPassword("");
    setBusy(false);
  };

  const signOut = async () => {
    setBusy(true);
    const r = await window.hiremate.account.signOut();
    if (r.ok) setStatus(r.data);
    setBusy(false);
  };

  return (
    <section className="glass rounded-3xl p-7" aria-labelledby="account-title">
      <h2 id="account-title" className="flex items-center gap-2 text-lg font-semibold text-mist">
        <UserRound className="h-5 w-5 text-electric-soft" /> Account and sync
      </h2>

      {loadError && <p role="alert" className="mt-3 text-sm text-rose-300">{loadError}</p>}
      {!status && !loadError && <div className="mt-4 h-24 animate-pulse rounded-2xl bg-white/[0.04]" />}

      {status && !status.configured && (
        <div className="mt-3 space-y-2 text-sm text-haze">
          <p className="flex items-center gap-2"><CloudOff className="h-4 w-4 text-dim" /> Cloud sync is off in this build. Everything is saved on this PC.</p>
          {status.configProblem ? (
            <p role="alert" className="text-amber-200">{status.configProblem}</p>
          ) : (
            <p className="text-dim">To turn it on, add your Supabase project URL and anon key to the <code>.env</code> file (see README), then restart.</p>
          )}
        </div>
      )}

      {status?.configured && status.signedIn && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Signed in and syncing</p>
            <p className="mt-1 text-[15px] text-mist" data-selectable>{status.email}</p>
            {!status.sessionPersisted && <p className="mt-1 text-xs text-amber-200">You'll need to sign in again next time (Windows encryption unavailable).</p>}
          </div>
          <button type="button" disabled={busy} onClick={() => void signOut()} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-haze hover:bg-white/[0.05] hover:text-mist disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Sign out
          </button>
        </div>
      )}

      {status?.configured && !status.signedIn && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div role="tablist" className="inline-flex rounded-xl bg-white/[0.04] p-1 text-sm">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => { setMode(m); setError(null); }}
                className={`rounded-lg px-3 py-1.5 ${mode === m ? "bg-white/[0.09] text-mist" : "text-haze hover:text-mist"}`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <label className="block text-sm text-haze">
            Email
            <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/10 bg-navy-800 px-3 focus-within:border-electric/50">
              <Mail className="h-4 w-4 text-dim" />
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-transparent py-2.5 text-sm text-mist outline-none" />
            </span>
          </label>
          <label className="block text-sm text-haze">
            Password {mode === "signup" && <span className="text-dim">(at least 8 characters)</span>}
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-navy-800 px-3 py-2.5 text-sm text-mist outline-none focus:border-electric/50"
            />
          </label>
          <button type="submit" disabled={busy || !email || password.length < 8} className="inline-flex items-center gap-2 rounded-xl bg-electric px-4 py-2 text-sm font-semibold text-white hover:bg-electric/90 disabled:cursor-not-allowed disabled:opacity-40">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
          {notice && <p className="text-sm text-success">{notice}</p>}
        </form>
      )}
    </section>
  );
}
