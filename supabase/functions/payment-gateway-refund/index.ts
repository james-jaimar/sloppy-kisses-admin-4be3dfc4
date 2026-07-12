// Payment gateway refund dispatcher.
// Today: `manual` provider path is fully live via the record_manual_refund RPC.
// PayFast / Yoco / Stripe paths return 501 until API credentials are connected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    // TODO once merchant is signed up:
    //   1. Read merchant_id + passphrase from Deno.env (name held in payment_providers.webhook_secret_ref).
    //   2. POST to PayFast refund endpoint with signature.
    //   3. Insert payment_refunds row status='pending' + provider_refund_id.
    //   4. Real status update comes from the ITN webhook (payment-gateway-webhook).
    return json({ error: "payfast_not_configured", message: "PayFast refunds are not enabled yet. Connect PayFast in Settings → Payment providers." }, 501);
  }

  return json({ error: "provider_not_supported", provider }, 501);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}