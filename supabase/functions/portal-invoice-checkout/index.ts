// Builds a signed PayFast Checkout redirect URL for a portal-authenticated customer.
// Auth: caller must be signed in and the invoice must belong to their linked customer row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkoutHost, payfastSignature, type PayFastMode, type PayFastSettings } from "../_shared/payfast.ts";

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

  const { data: userRes, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "not_authenticated" }, 401);

  let body: { invoice_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const invoiceId = body.invoice_id;
  if (!invoiceId) return json({ error: "missing_invoice_id" }, 400);

  const { data: inv, error: invErr } = await admin
    .from("invoices")
    .select("id, tenant_id, customer_id, invoice_number, balance_due, status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr) return json({ error: invErr.message }, 500);
  if (!inv) return json({ error: "invoice_not_found" }, 404);

  // Verify the caller's linked customer matches this invoice
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", userRes.user.id)
    .maybeSingle();
  if (!profile) return json({ error: "no_profile" }, 403);

  const { data: cust } = await admin
    .from("customers")
    .select("id, full_name, email")
    .eq("id", inv.customer_id)
    .eq("linked_profile_id", profile.id)
    .eq("portal_access_enabled", true)
    .maybeSingle();
  if (!cust) return json({ error: "forbidden" }, 403);

  if (Number(inv.balance_due) <= 0) return json({ error: "nothing_to_pay" }, 400);
  if (inv.status === "draft" || inv.status === "cancelled") return json({ error: "invoice_not_payable" }, 400);

  const { data: pf, error: pfErr } = await admin
    .from("payment_providers")
    .select("mode, settings, enabled")
    .eq("tenant_id", inv.tenant_id)
    .eq("provider", "payfast")
    .maybeSingle();
  if (pfErr) return json({ error: pfErr.message }, 500);
  if (!pf || !pf.enabled) return json({ error: "payfast_not_enabled" }, 403);
  const settings = (pf.settings ?? {}) as PayFastSettings;
  const mode = (pf.mode ?? "test") as PayFastMode;
  if (!settings.merchant_id || !settings.merchant_key) return json({ error: "payfast_not_configured" }, 500);

  const [firstName, ...restName] = (cust.full_name ?? "Customer").split(" ");
  const lastName = restName.join(" ") || "-";

  const fields: Record<string, string> = {
    merchant_id: settings.merchant_id,
    merchant_key: settings.merchant_key,
    return_url: settings.return_url ?? "",
    cancel_url: settings.cancel_url ?? "",
    notify_url: settings.notify_url ?? "",
    name_first: firstName,
    name_last: lastName,
    email_address: cust.email ?? "",
    m_payment_id: inv.id,
    amount: Number(inv.balance_due).toFixed(2),
    item_name: `Invoice ${inv.invoice_number}`,
    item_description: `Payment for invoice ${inv.invoice_number}`,
  };
  const orderedKeys = Object.keys(fields);
  const signature = await payfastSignature(fields, settings.passphrase ?? null, orderedKeys);

  const form = new URLSearchParams();
  for (const k of orderedKeys) if (fields[k]) form.append(k, fields[k]);
  form.append("signature", signature);

  const redirect_url = `${checkoutHost(mode)}/eng/process?${form.toString()}`;
  return json({ redirect_url });
});