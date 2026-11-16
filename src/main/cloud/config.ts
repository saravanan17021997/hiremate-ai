// Supabase project settings, baked in at build time from .env (public values only).
// Refuses secret keys so a service-role key can never ship inside the app.

export interface CloudConfig {
  url: string;
  anonKey: string;
}

export function validateCloudConfig(url?: string, key?: string): { config: CloudConfig | null; problem: string | null } {
  const u = url?.trim();
  const k = key?.trim();
  if (!u && !k) return { config: null, problem: null }; // not configured: the app works offline
  if (!u || !k) return { config: null, problem: "Both MAIN_VITE_SUPABASE_URL and MAIN_VITE_SUPABASE_ANON_KEY are needed in .env." };
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(u)) return { config: null, problem: "MAIN_VITE_SUPABASE_URL should look like https://xxxx.supabase.co" };
  if (k.startsWith("sb_secret_") || jwtRole(k) === "service_role") {
    return { config: null, problem: "That is a SECRET Supabase key. Use the public anon key; never put a secret key in the app." };
  }
  if (!(k.startsWith("eyJ") || k.startsWith("sb_publishable_"))) return { config: null, problem: "MAIN_VITE_SUPABASE_ANON_KEY doesn't look like a Supabase public key." };
  return { config: { url: u.replace(/\/$/, ""), anonKey: k }, problem: null };
}

function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}
