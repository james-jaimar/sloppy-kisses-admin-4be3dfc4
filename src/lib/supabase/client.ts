import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// The real backend is the user's own Supabase project:
// https://jsmsyezkfxtgmxvgfuxx.supabase.co
// Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY once the project is wired.
export const supabase: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const isSupabaseConfigured = () => supabase !== null;