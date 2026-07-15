// Staff triggers a portal password reset email for a customer.
// Verifies customers.portal.manage in the tenant.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendAuthEmail, generateTenantActionUrl, resolveTenantAppUrl } from "../_shared/auth-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json(401, { error: "Missing Authorization header" });

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: userRes, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userRes?.user) return json(401, { error: "Not authenticated" });

  let payload: { tenant_id?: string; customer_id?: string };
  try { payload = await req.json(); } catch { return json(400, { error: "Invalid JSON body" }); }
  const tenantId = payload.tenant_id;
  const customerId = payload.customer_id;
  if (!tenantId || !customerId) return json(400, { error: "tenant_id and customer_id are required" });

  const { data: canManage } = await asCaller.rpc("user_has_permission", {
    target_tenant_id: tenantId,
    permission_code: "customers.portal.manage",
  });
  if (!canManage) return json(403, { error: "Missing permission customers.portal.manage" });

  const { data: cust, error: cErr } = await admin
    .from("customers")
    .select("id, email")
    .eq("id", customerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (cErr) return json(500, { error: cErr.message });
  if (!cust) return json(404, { error: "Customer not found" });
  const email = (cust.email ?? "").trim().toLowerCase();
  if (!email) return json(400, { error: "Customer has no email address" });

  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  let appUrl: string;
  try { appUrl = await resolveTenantAppUrl(admin, tenantId, origin || null); }
  catch (e) { return json(500, { error: (e as Error).message }); }

  let emailSent = true;
  let emailError: string | null = null;
  try {
    const actionUrl = await generateTenantActionUrl(admin, "recovery", email, appUrl, "/reset-password");
    const sent = await sendAuthEmail({ admin, tenantId, action: "recovery", recipient: email, actionUrl });
    emailSent = sent.ok;
    if (!sent.ok) emailError = sent.error;
  } catch (e) {
    emailSent = false;
    emailError = (e as Error).message;
  }

  try {
    await admin.from("notification_events").insert({
      tenant_id: tenantId,
      event_type: "password_reset_requested",
      customer_id: cust.id,
      payload: { email, initiated_by: "staff" },
      status: emailSent ? "sent" : "failed",
    });
  } catch { /* ignore */ }

  return json(200, { ok: true, email_sent: emailSent, email_error: emailError });
});