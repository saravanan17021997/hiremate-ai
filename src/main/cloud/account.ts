// Supabase sign-in, run entirely in the main process.
// The sign-in session (tokens) is saved encrypted with the same SecretStore as API keys,
// so the app screen never sees tokens either.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AccountStatus, SignUpResult } from "@shared/types";
import type { SecretStore } from "../secrets/secretStore";
import type { CloudConfig } from "./config";

export class AccountError extends Error {}

/** Turns Supabase auth errors into plain sentences. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Wrong email or password.";
  if (m.includes("email not confirmed")) return "Please confirm your email first: open the link Supabase sent to your inbox, then sign in.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists. Sign in instead.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("password") && m.includes("characters")) return "Password is too short. Use at least 8 characters.";
  if (m.includes("fetch failed") || m.includes("network")) return "Couldn't reach Supabase. Check your internet connection.";
  return message;
}

export class AccountService {
  readonly client: SupabaseClient | null;
  private persisted: boolean;

  constructor(
    config: CloudConfig | null,
    secrets: SecretStore,
    private readonly configProblem: string | null = null,
    clientFactory: typeof createClient = createClient,
  ) {
    this.persisted = secrets.encryptionAvailable;
    const memory = new Map<string, string>(); // fallback when Windows encryption isn't available
    const storage = {
      getItem: (k: string) => (this.persisted ? secrets.get(`supabase.${k}`) : (memory.get(k) ?? null)),
      setItem: (k: string, v: string) => (this.persisted ? secrets.set(`supabase.${k}`, v) : void memory.set(k, v)),
      removeItem: (k: string) => (this.persisted ? secrets.delete(`supabase.${k}`) : void memory.delete(k)),
    };
    this.client = config
      ? clientFactory(config.url, config.anonKey, {
          auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        })
      : null;
  }

  async status(): Promise<AccountStatus> {
    if (!this.client) return { configured: false, signedIn: false, email: null, sessionPersisted: false, configProblem: this.configProblem };
    const { data } = await this.client.auth.getSession();
    return {
      configured: true,
      signedIn: Boolean(data.session),
      email: data.session?.user.email ?? null,
      sessionPersisted: this.persisted,
      configProblem: null,
    };
  }

  async signUp(email: string, password: string): Promise<SignUpResult> {
    const client = this.need();
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw new AccountError(friendlyAuthError(error.message));
    // With "Confirm email" on (Supabase default) there is no session until the link is clicked.
    return { status: await this.status(), needsEmailConfirmation: !data.session };
  }

  async signIn(email: string, password: string): Promise<AccountStatus> {
    const { error } = await this.need().auth.signInWithPassword({ email, password });
    if (error) throw new AccountError(friendlyAuthError(error.message));
    return this.status();
  }

  async signOut(): Promise<AccountStatus> {
    if (this.client) {
      const { error } = await this.client.auth.signOut({ scope: "local" });
      if (error) console.warn("[account] sign-out:", error.message);
    }
    return this.status();
  }

  async isSignedIn() {
    return (await this.status()).signedIn;
  }

  private need(): SupabaseClient {
    if (!this.client) throw new AccountError("Cloud sync isn't set up in this build. Add the Supabase URL and anon key to .env, then restart.");
    return this.client;
  }
}
