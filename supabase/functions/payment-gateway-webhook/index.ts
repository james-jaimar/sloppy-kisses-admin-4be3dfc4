// Inbound ITN receiver. Per-tenant creds: looked up in payment_providers via m_payment_id → invoice → tenant.
// PayFast never sends an auth header — trust is established by (a) source IP range,
// (b) signature verification with the tenant's passphrase, and (c) a callback POST
// to PayFast's validate endpoint. Dedupe by pf_payment_id.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkoutHost, payfastSignature, type PayFastMode, type PayFastSettings } from "../_shared/payfast.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// PayFast published source IP hosts. We resolve on demand so the list is always current.
const PAYFAST_HOSTS = [
  "www.payfast.co.za",
  "sandbox.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405, headers: corsHeaders });

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") ?? "payfast";

  const rawText = await req.text();

  if (provider !== "payfast") {
    console.log("[webhook] ignoring unknown provider", provider);
    return new Response("ignored", { status: 202, headers: corsHeaders });
  }

  // Parse form-urlencoded ITN body.
  const params = new URLSearchParams(rawText);
  const body: Record<string, string> = {};
  params.forEach((v, k) => { body[k] = v; });

  const m_payment_id = body["m_payment_id"];      // our invoice id (we set this on checkout)
  const pf_payment_id = body["pf_payment_id"];    // PayFast's own id
  const payment_status = body["payment_status"];
  const merchant_id = body["merchant_id"];
  const provided_signature = body["signature"];

  if (!m_payment_id || !pf_payment_id) {
    return json({ error: "missing_ids" }, 400);
  }

  // Determine tenant either from invoice (payments) or refund lookup.
  const isRefundNotification = body["custom_str1"] === "refund" && body["custom_str2"];
  let tenantId: string | null = null;
  let invoiceId: string | null = null;
  let customerId: string | null = null;
  let refundRowId: string | null = null;

  if (isRefundNotification) {
    refundRowId = body["custom_str2"];
    const { data: r } = await admin.from("payment_refunds").select("tenant_id, invoice_id, customer_id").eq("id", refundRowId).maybeSingle();
    tenantId = r?.tenant_id ?? null; invoiceId = r?.invoice_id ?? null; customerId = r?.customer_id ?? null;
  } else {
    const { data: inv } = await admin.from("invoices").select("id, tenant_id, customer_id, total, balance_due, status, currency").eq("id", m_payment_id).maybeSingle();
    if (!inv) return json({ error: "invoice_not_found" }, 404);
    tenantId = inv.tenant_id; invoiceId = inv.id; customerId = inv.customer_id;
  }

  if (!tenantId) return json({ error: "tenant_not_resolved" }, 404);

  // Load tenant's PayFast creds.
  const { data: pf } = await admin.from("payment_providers")
    .select("mode, settings, enabled")
    .eq("tenant_id", tenantId).eq("provider", "payfast").maybeSingle();
  if (!pf || !pf.enabled) return json({ error: "payfast_not_enabled_for_tenant" }, 403);
  const settings = (pf.settings ?? {}) as PayFastSettings;
  const mode = (pf.mode ?? "test") as PayFastMode;

  if (merchant_id && settings.merchant_id && merchant_id !== settings.merchant_id) {
    return json({ error: "merchant_id_mismatch" }, 400);
  }

  // 1. Signature check using the tenant's passphrase, over the ITN fields
  //    in the order they arrived, excluding `signature`.
  const sigFields: Record<string, string> = {};
  const orderedKeys: string[] = [];
  for (const [k, v] of params.entries()) {
    if (k === "signature") continue;
    sigFields[k] = v; orderedKeys.push(k);
  }
  const expected = await payfastSignature(sigFields, settings.passphrase ?? null, orderedKeys);
  if (!provided_signature || expected !== provided_signature) {
    console.warn("[itn] signature mismatch", { expected, provided_signature });
    return json({ error: "bad_signature" }, 400);
  }

  // 2. Callback to PayFast to validate the payload.
  try {
    const validateRes = await fetch(`${checkoutHost(mode)}/eng/query/validate`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: rawText,
    });
    const validateBody = (await validateRes.text()).trim();
    if (!validateBody.startsWith("VALID")) {
      console.warn("[itn] validate failed", validateBody);
      return json({ error: "not_validated_by_payfast" }, 400);
    }
  } catch (e) {
    console.warn("[itn] validate call error", (e as Error).message);
    return json({ error: "validate_call_failed" }, 502);
  }

  // 3. Apply the effect.
  if (isRefundNotification && refundRowId) {
    const newStatus = payment_status === "COMPLETE" ? "succeeded" : payment_status === "FAILED" ? "failed" : "processing";
    await admin.from("payment_refunds").update({
      status: newStatus,
      provider_status: payment_status,
      provider_refund_id: pf_payment_id,
      provider_payload: body,
    }).eq("id", refundRowId);
    return json({ ok: true, kind: "refund", status: newStatus });
  }

  // Invoice payment.
  if (payment_status !== "COMPLETE") {
    console.log("[itn] non-complete payment_status", payment_status);
    return json({ ok: true, kind: "payment", status: payment_status, note: "not recorded" });
  }

  // Dedupe on pf_payment_id (unique index).
  const { data: existing } = await admin.from("payments").select("id").eq("pf_payment_id", pf_payment_id).maybeSingle();
  if (existing) return json({ ok: true, kind: "payment", dedup: true, payment_id: existing.id });

  const amountGross = Number(body["amount_gross"] ?? "0");
  const { data: inserted, error: insErr } = await admin.from("payments").insert({
    tenant_id: tenantId,
    customer_id: customerId,
    invoice_id: invoiceId,
    amount: amountGross,
    payment_method: "card",
    payment_reference: body["m_payment_id"],
    provider: "payfast",
    provider_mode: mode,
    pf_payment_id,
    provider_payload: body,
    status: "captured",
    paid_at: new Date().toISOString(),
    notes: "PayFast online payment",
  }).select("id").maybeSingle();
  if (insErr) return json({ error: insErr.message }, 500);

  return json({ ok: true, kind: "payment", payment_id: inserted?.id });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}