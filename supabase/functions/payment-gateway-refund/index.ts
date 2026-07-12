// Payment gateway refund dispatcher.
// Today: `manual` provider path is fully live via the record_manual_refund RPC.
// PayFast / Yoco / Stripe paths return 501 until API credentials are connected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { apiHost, payfastSignature, type PayFastMode, type PayFastSettings } from "../_shared/payfast.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RefundRequest {
  payment_id: string;
  amount: number;
  method?: string | null;
  reference?: string | null;
  credit_note_id?: string | null;
  notes?: string | null;
  refund_date?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: RefundRequest;
  try { body = await req.json(); }
  catch { return json({ error: "invalid_json" }, 400); }

  if (!body.payment_id || !body.amount || body.amount <= 0) {
    return json({ error: "payment_id and positive amount are required" }, 400);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthenticated" }, 401);

  const admin = createClient(url, service);
  const { data: payment, error: payErr } = await admin
    .from("payments")
    .select("id, tenant_id, amount, amount_refunded, payment_method, invoice_id, customer_id")
    .eq("id", body.payment_id)
    .maybeSingle();
  if (payErr) return json({ error: payErr.message }, 500);
  if (!payment) return json({ error: "payment_not_found" }, 404);

  const { data: providers } = await admin
    .from("payment_providers")
    .select("provider, enabled, mode")
    .eq("tenant_id", payment.tenant_id)
    .eq("enabled", true);
  const gateway = (providers ?? []).find((p: any) => p.provider !== "manual");
  const provider = gateway?.provider ?? "manual";

  if (provider === "manual") {
    const { data: refundId, error } = await userClient.rpc("record_manual_refund", {
      p_payment_id: body.payment_id,
      p_amount: body.amount,
      p_method: body.method ?? null,
      p_reference: body.reference ?? null,
      p_credit_note_id: body.credit_note_id ?? null,
      p_notes: body.notes ?? null,
      p_refund_date: body.refund_date ?? null,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, provider, refund_id: refundId });
  }

  if (provider === "payfast") {
    const pfRow = (providers ?? []).find((p: any) => p.provider === "payfast");
    const settings = (pfRow?.settings ?? {}) as PayFastSettings;
    const mode = (pfRow?.mode ?? "test") as PayFastMode;
    if (!settings.merchant_id || !settings.merchant_key) {
      return json({ error: "payfast_not_configured", message: "PayFast credentials are missing. Enter them in Settings → Payment providers." }, 400);
    }
    if (!payment.pf_payment_id && !(body as any).pf_payment_id) {
      return json({
        error: "not_a_payfast_payment",
        message: "This payment wasn't captured via PayFast, so it can't be refunded through PayFast. Record a manual refund instead.",
      }, 400);
    }

    const pf_payment_id = (body as any).pf_payment_id ?? payment.pf_payment_id;

    // PayFast refund API: PUT https://<host>/subscriptions/<pf_payment_id>/refund
    // Auth via signature over merchant fields + timestamp. Kept minimal — the
    // Sandbox refund endpoint accepts this shape.
    const fields: Record<string, string> = {
      "merchant-id": settings.merchant_id,
      "version": "v1",
      "timestamp": new Date().toISOString(),
      "amount": String(Math.round(Number(body.amount) * 100)), // cents
      "reason": (body.reference ?? body.notes ?? "Refund").slice(0, 255),
    };
    const signature = await payfastSignature(fields, settings.passphrase ?? null);

    const res = await fetch(`${apiHost(mode)}/refunds/${encodeURIComponent(pf_payment_id)}`, {
      method: "POST",
      headers: { ...fields, signature, "content-type": "application/x-www-form-urlencoded" } as any,
    });
    const bodyText = await res.text();
    let parsed: any; try { parsed = JSON.parse(bodyText); } catch { parsed = { raw: bodyText }; }

    // Record the refund row (status pending; webhook flips it to succeeded/failed).
    const { data: refund, error: insErr } = await admin.from("payment_refunds").insert({
      tenant_id: payment.tenant_id,
      payment_id: payment.id,
      invoice_id: payment.invoice_id,
      customer_id: payment.customer_id,
      credit_note_id: body.credit_note_id ?? null,
      amount: body.amount,
      method: body.method ?? payment.payment_method ?? null,
      reference: body.reference ?? null,
      notes: body.notes ?? null,
      provider: "payfast",
      status: res.ok ? "pending" : "failed",
      provider_status: res.ok ? "requested" : "error",
      provider_payload: parsed,
      provider_error: res.ok ? null : bodyText.slice(0, 500),
      refund_date: body.refund_date ?? new Date().toISOString().slice(0, 10),
    }).select("id").maybeSingle();
    if (insErr) return json({ error: insErr.message }, 500);

    return json({ ok: res.ok, provider, refund_id: refund?.id, provider_response: parsed }, res.ok ? 200 : 502);
  }

  return json({ error: "provider_not_supported", provider }, 501);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}