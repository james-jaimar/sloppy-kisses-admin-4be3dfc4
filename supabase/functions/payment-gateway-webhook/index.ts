// Inbound webhook receiver for payment gateway callbacks (PayFast ITN, Yoco, Stripe).
// Today: stubbed. When a gateway is wired, this endpoint verifies the signature and
// updates the corresponding payment_refunds row (status, provider_status, provider_payload).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405, headers: corsHeaders });

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") ?? "unknown";

  const rawText = await req.text();
  let payload: unknown;
  try { payload = JSON.parse(rawText); } catch { payload = { raw: rawText }; }

  // TODO per provider:
  //   - payfast: verify signature using passphrase, POST back to ITN validate URL, update payment_refunds row.
  //   - yoco / stripe: verify signature header, update row.
  console.log("[payment-gateway-webhook] provider=%s payload=%o", provider, payload);

  return new Response(JSON.stringify({ ok: true, provider, note: "stub" }), {
    status: 202,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});