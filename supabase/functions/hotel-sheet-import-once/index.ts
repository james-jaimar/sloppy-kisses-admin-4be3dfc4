import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "POST required" });
  const secret = Deno.env.get("XERO_CRON_SECRET");
  if (!secret || request.headers.get("x-import-secret") !== secret) return reply(401, { error: "Unauthorised" });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return reply(503, { error: "Import service unavailable" });
  try {
    const payload = await request.json();
    if (payload?.batch !== "hotel-sheet-2026-11-22" || payload?.tenant_id !== "75cc6a9e-9d17-4268-92ee-8b595c842dee"
        || !Array.isArray(payload.records) || payload.records.length > 130) {
      return reply(400, { error: "Invalid approved hotel import batch" });
    }
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client.rpc("import_hotel_sheet_20261122", { p_data: payload });
    if (error) return reply(422, { error: error.message });
    return reply(200, data);
  } catch (error) {
    return reply(400, { error: error instanceof Error ? error.message : "Invalid import request" });
  }
});