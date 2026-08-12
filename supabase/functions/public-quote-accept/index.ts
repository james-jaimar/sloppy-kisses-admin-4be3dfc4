// Accepts a hotel quote from the public /q/:token link (no login required)
// and, when the tenant wants it, switches on the customer's portal login.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const j = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j(405, { error: "Method not allowed" });

  let body: any;
  try { body = await req.json(); } catch { return j(400, { error: "Invalid JSON" }); }
  const token: string | undefined = body?.token;
  if (!token || !UUID.test(token)) return j(400, { error: "A valid quote link is required" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data, error } = await admin.rpc("accept_public_quote", { p_token: token });
  if (error) return j(200, { ok: false, error: error.message });
  const res = (data ?? {}) as any;
  if (!res.ok) return j(200, { ok: false, error: res.error ?? "Could not accept this quote" });

  // Portal activation — best effort, never blocks the acceptance.
  let portal: { activated: boolean; email_sent?: boolean; error?: string | null } = { activated: false };
  if (res.activate_portal && res.customer_id && res.tenant_id) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/customer-portal-invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          origin: req.headers.get("origin") ?? "",
        },
        body: JSON.stringify({ tenant_id: res.tenant_id, customer_id: res.customer_id, mode: "invite" }),
      });
      const rb = await r.json().catch(() => ({}));
      portal = { activated: r.ok && rb?.ok === true, email_sent: rb?.email_sent ?? false, error: rb?.error ?? rb?.email_error ?? null };
    } catch (e) {
      portal = { activated: false, error: (e as Error).message };
    }
  }

  return j(200, {
    ok: true,
    booking_id: res.booking_id,
    invoice_number: res.invoice_number ?? null,
    invoice_token: res.invoice_token ?? null,
    customer_email: res.customer_email ?? null,
    portal,
  });
});