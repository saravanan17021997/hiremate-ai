// The browser's connection to Supabase: sign-in and the user's own rows (row-level security).
// The URL and the "anon public" key are public by design; the AI key never comes here.
import { createClient } from "@supabase/supabase-js";
import { DB_SCHEMA } from "@shared/types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configProblem = !url || !anon ? "This site was built without VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." : null;

export const supabase = createClient(url || "https://not-configured.invalid", anon || "not-configured", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "hiremate-web-auth" },
  db: { schema: DB_SCHEMA }, // HireMate's own schema: never touches other apps' tables
});
