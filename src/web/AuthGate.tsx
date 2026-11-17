// Web version only: you must sign in, and your email must be on the owner's invite list,
// before any screen (or any AI request) is available.
import { Loader2, LogOut } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Logo } from "@renderer/components/Logo";
import { configProblem, supabase } from "./supabase";
import { loadMe } from "./webApi";

type Gate = { state: "loading" } | { state: "signedOut" } | { state: "blocked"; message: string } | { state: "ready" };

export function AuthGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ state: "loading" });

  useEffect(() => {
    // Supabase re-announces "signed in" when the tab regains focus or refreshes its token. Only a change of
    // person may reset the app; otherwise a running live session would be wiped mid-meeting.
    let current: string | null | undefined; // user id we last checked (undefined = not checked yet)
    const check = async (uid: string | null) => {
      if (uid === current) return;
      current = uid;
      if (!uid) return setGate({ state: "signedOut" });
      setGate({ state: "loading" });
      try {
        await loadMe(true);
        if (current === uid) setGate({ state: "ready" });
      } catch (e) {
        if (current === uid) setGate({ state: "blocked", message: e instanceof Error ? e.message : "Couldn't check your account." });
      }
    };
    void supabase.auth.getSession().then(({ data }) => check(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Run outside Supabase's own callback (it holds a lock while calling us).
      setTimeout(() => void check(session?.user.id ?? null), 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (gate.state === "ready") return <>{children}</>;
  return (
    <div className="app-backdrop flex min-h-screen items-center justify-center p-6">
      <div className="glass w-full max-w-md rounded-3xl p-8">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div>
            <h1 className="text-lg font-semibold text-mist">HireMate AI</h1>
            <p className="text-sm text-haze">Interview and meeting preparation</p>
          </div>
        </div>
        {configProblem ? (
          <p role="alert" className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{configProblem}</p>
        ) : gate.state === "loading" ? (
          <p className="mt-8 flex items-center gap-2 text-sm text-haze"><Loader2 className="h-4 w-4 animate-spin" /> Checking your account…</p>
        ) : gate.state === "blocked" ? (
          <Blocked message={gate.message} />
        ) : (
          <SignIn />
        )}
      </div>
    </div>
  );
}

function Blocked({ message }: { message: string }) {
  return (
    <div className="mt-6 space-y-4">
      <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{message}</p>
      <button type="button" onClick={() => void supabase.auth.signOut()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-mist hover:bg-white/[0.05]">
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}

function SignIn() {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const r = mode === "signIn" ? await window.hiremate.account.signIn(email.trim(), password) : await window.hiremate.account.signUp(email.trim(), password);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (mode === "signUp" && "needsEmailConfirmation" in r.data && r.data.needsEmailConfirmation) {
      setNotice("Check your email and open the confirmation link, then sign in here.");
      setMode("signIn");
    }
  };

  const input = "mt-1.5 w-full rounded-xl border border-white/10 bg-navy-800 px-4 py-2.5 text-[15px] text-mist outline-none focus:border-electric/50";
  return (
    <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
      <p className="text-sm text-haze">{mode === "signIn" ? "Sign in with the email the owner invited." : "Create an account with the email the owner invited."}</p>
      <label className="block text-sm text-haze">
        Email
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      </label>
      <label className="block text-sm text-haze">
        Password
        <input type="password" required minLength={8} autoComplete={mode === "signIn" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
      </label>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
      <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-electric to-violet px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {mode === "signIn" ? "Sign in" : "Create account"}
      </button>
      <button type="button" onClick={() => { setMode(mode === "signIn" ? "signUp" : "signIn"); setError(null); }} className="w-full text-center text-sm text-electric-soft underline-offset-4 hover:underline">
        {mode === "signIn" ? "First time here? Create an account" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
