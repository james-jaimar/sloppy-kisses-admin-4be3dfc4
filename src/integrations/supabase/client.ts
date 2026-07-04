// Compatibility re-export. Single source of truth lives at
// src/lib/supabase/client.ts and reads config from Vite env vars.
// This file exists so `@/integrations/supabase/client` imports keep working.
export { supabase } from "@/lib/supabase/client";
export type { Database } from "@/integrations/supabase/types";