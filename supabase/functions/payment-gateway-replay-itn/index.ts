// Staff-only replay: re-posts a previously logged PayFast ITN (raw body kept in
// payment_webhook_events) through the real webhook, so a notification that we
// rejected because of a bug can be applied without asking PayFast to resend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "not_authenticated" }, 401);

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: userRes } = await asCaller.auth.getUser();
  if (!userRes?.user) return json({ error: "not_authenticated" }, 401);

  let body: { event_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (!body.event_id) return json({ error: "missing_event_id" }, 400);

  // Read through the caller's RLS so only staff of the owning tenant can replay.
  const { data: evt, error: evtErr } = await asCaller
    .from("payment_webhook_events")
    .select("id, raw_body, outcome, tenant_id, m_payment_id, pf_payment_id")
    .eq("id", body.event_id)
    .maybeSingle();
  if (evtErr) return json({ error: evtErr.message }, 500);
  if (!evt) return json({ error: "event_not_found_or_forbidden" }, 404);
  if (!evt.raw_body) return json({ error: "no_raw_body_stored" }, 400);

  const webhookUrl = `${SUPABASE_URL}/functions/v1/payment-gateway-webhook?provider=payfast`;
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: evt.raw_body,
  });
  const text = await res.text();

  await admin.from("payment_webhook_events")
    .update({ error_text: `replayed by staff at ${new Date().toISOString()} → ${res.status} ${text.slice(0, 200)}` })
    .eq("id", evt.id);

  return json({ ok: res.ok, status: res.status, webhook_response: text });
});
