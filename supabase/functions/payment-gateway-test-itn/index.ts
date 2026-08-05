// Staff-only self-test: builds a correctly signed PayFast ITN for an unpaid
// invoice and posts it through the real webhook, so credentials, signature and
// invoice application can be verified without involving PayFast.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { payfastSignature, type PayFastMode, type PayFastSettings } from "../_shared/payfast.ts";

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

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: userRes } = await asCaller.auth.getUser();
  if (!userRes?.user) return json({ error: "not_authenticated" }, 401);

  let body: { invoice_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (!body.invoice_id) return json({ error: "missing_invoice_id" }, 400);

  const { data: inv } = await admin
    .from("invoices")
    .select("id, tenant_id, invoice_number, balance_due, status")
    .eq("id", body.invoice_id)
    .maybeSingle();
  if (!inv) return json({ error: "invoice_not_found" }, 404);

  // RLS check: the caller must be allowed to read this tenant's provider row.
  const { data: pfAsCaller } = await asCaller
    .from("payment_providers")
    .select("tenant_id")
    .eq("tenant_id", inv.tenant_id)
    .eq("provider", "payfast")
    .maybeSingle();
  if (!pfAsCaller) return json({ error: "forbidden" }, 403);

  const { data: pf } = await admin
    .from("payment_providers")
    .select("mode, settings, enabled")
    .eq("tenant_id", inv.tenant_id)
    .eq("provider", "payfast")
    .maybeSingle();
  if (!pf?.enabled) return json({ error: "payfast_not_enabled" }, 403);
  const settings = (pf.settings ?? {}) as PayFastSettings;
  const mode = (pf.mode ?? "test") as PayFastMode;
  if (mode === "live") return json({ error: "refusing_to_simulate_in_live_mode" }, 400);

  const amount = Number(inv.balance_due).toFixed(2);
  const fields: Record<string, string> = {
    m_payment_id: inv.id,
    pf_payment_id: `SELFTEST-${Date.now()}`,
    payment_status: "COMPLETE",
    item_name: `Invoice ${inv.invoice_number}`,
    amount_gross: amount,
    amount_fee: "0.00",
    amount_net: amount,
    merchant_id: settings.merchant_id,
    custom_str1: "selftest",
  };
  const orderedKeys = Object.keys(fields);
  const signature = await payfastSignature(fields, settings.passphrase ?? null, orderedKeys);

  const form = new URLSearchParams();
  for (const k of orderedKeys) if (fields[k]) form.append(k, fields[k]);
  form.append("signature", signature);

  const webhookUrl = `${SUPABASE_URL}/functions/v1/payment-gateway-webhook?provider=payfast`;
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();

  return json({ ok: res.ok, status: res.status, webhook_response: text, pf_payment_id: fields.pf_payment_id });
});