// Builds a signed PayFast Checkout redirect URL for a public invoice link.
// Auth: public — caller must supply a valid invoice `public_view_token`.
// Credentials are loaded from `payment_providers` for the invoice's tenant.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkoutHost, payfastSignature, type PayFastMode, type PayFastSettings } from "../_shared/payfast.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { token?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const token = body?.token;
  if (!token) return json({ error: "missing_token" }, 400);

  // Resolve the invoice from its public view token.
  const { data: inv, error: invErr } = await admin
    .from("invoices")
    .select("id, tenant_id, customer_id, invoice_number, balance_due, status")
    .eq("public_view_token", token)
    .maybeSingle();
  if (invErr) return json({ error: invErr.message }, 500);
  if (!inv) return json({ error: "invoice_not_found" }, 404);
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

  const { data: customer } = await admin.from("customers").select("full_name, email").eq("id", inv.customer_id).maybeSingle();

  const [firstName, ...restName] = (customer?.full_name ?? "Customer").split(" ");
  const lastName = restName.join(" ") || "-";

  // Record the attempt so a redirect that never comes back is still visible.
  const { data: attempt } = await admin.from("payment_attempts").insert({
    tenant_id: inv.tenant_id,
    invoice_id: inv.id,
    customer_id: inv.customer_id,
    provider: "payfast",
    provider_mode: mode,
    amount: Number(inv.balance_due),
    status: "redirected",
    origin: "public_invoice_link",
  }).select("id").maybeSingle();
  const attemptId = attempt?.id ?? null;

  const baseReturn = settings.return_url ?? "";
  const returnUrl = baseReturn && attemptId
    ? `${baseReturn}${baseReturn.includes("?") ? "&" : "?"}att=${attemptId}`
    : baseReturn;

  // Field order per PayFast spec.
  const fields: Record<string, string> = {
    merchant_id: settings.merchant_id,
    merchant_key: settings.merchant_key,
    return_url: returnUrl,
    cancel_url: settings.cancel_url ?? "",
    notify_url: settings.notify_url ?? "",
    name_first: firstName,
    name_last: lastName,
    email_address: customer?.email ?? "",
    m_payment_id: inv.id,
    amount: Number(inv.balance_due).toFixed(2),
    item_name: `Invoice ${inv.invoice_number}`,
    item_description: `Payment for invoice ${inv.invoice_number}`,
    custom_str3: attemptId ?? "",
  };
  const orderedKeys = Object.keys(fields);
  const signature = await payfastSignature(fields, settings.passphrase ?? null, orderedKeys);

  const form = new URLSearchParams();
  for (const k of orderedKeys) if (fields[k]) form.append(k, fields[k]);
  form.append("signature", signature);

  const redirect_url = `${checkoutHost(mode)}/eng/process?${form.toString()}`;
  return json({ redirect_url });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}