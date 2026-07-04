import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Single source of truth for the Supabase browser client.
// Config is read from Vite env vars — never hardcode URL or keys here.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);

export const supabase: SupabaseClient<Database> | null =
  url && anonKey
    ? createClient<Database>(url, anonKey, {
        auth: {
          storage: typeof window !== "undefined" ? window.localStorage : undefined,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const isSupabaseConfigured = () => supabase !== null;