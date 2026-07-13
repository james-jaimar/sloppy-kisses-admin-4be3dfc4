// Request a password reset email. Sent via tenant SMTP (not Supabase's built-in mailer).
// Always returns 200 to avoid account enumeration.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendAuthEmail, generateTenantActionUrl, resolveTenantAppUrl } from "../_shared/auth-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let payload: { email?: string; redirect_to?: string };
  try { payload = await req.json(); } catch { return json(400, { error: "Invalid JSON body" }); }
  const email = (payload.email ?? "").trim().toLowerCase();
  if (!email) return json(400, { error: "email is required" });

  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Resolve the user's tenant so we know whose SMTP + brand to use.
  const { data: prof } = await admin
    .from("profiles")
    .select("id,auth_user_id")
    .eq("email", email)
    .maybeSingle();

  let tenantId: string | null = null;
  if (prof?.id) {
    const { data: tu } = await admin
      .from("tenant_users")
      .select("tenant_id")
      .eq("profile_id", prof.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    tenantId = tu?.tenant_id ?? null;
  }
  if (!tenantId) {
    // Fallback: first tenant. Keeps single-tenant deploys working even before profile rows exist.
    const { data: t } = await admin
      .from("tenants")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    tenantId = t?.id ?? null;
  }

  if (!tenantId) return json(200, { ok: true }); // silently succeed, nothing to send

  try {
    const appUrl = await resolveTenantAppUrl(admin, tenantId, origin || payload.redirect_to || null);
    const actionUrl = await generateTenantActionUrl(admin, "recovery", email, appUrl, "/reset-password");
    await sendAuthEmail({ admin, tenantId, action: "recovery", recipient: email, actionUrl });
  } catch (e) {
    // Log but don't leak — keep response uniform.
    console.error("request-password-reset:", (e as Error).message);
  }
  return json(200, { ok: true });
});