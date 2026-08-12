// Invite a customer to the portal.
// - Verifies caller has customers.portal.manage in the tenant.
// - Creates or reuses a Supabase auth user for the customer's email.
// - Ensures a public.profiles row (user_type='customer') and links customers.linked_profile_id.
// - Sets portal_access_enabled = true.
// - Sends the branded invite email via tenant SMTP.

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

  // Server-to-server calls (e.g. accepting a quote from the public link) come
  // in with the service key and skip the staff permission check.
  const isServiceCall = authHeader.includes(SERVICE_KEY);
  const { data: userRes } = isServiceCall ? { data: null as any } : await asCaller.auth.getUser();
  if (!isServiceCall && !userRes?.user) return json(401, { error: "Not authenticated" });

  let payload: { tenant_id?: string; customer_id?: string; mode?: "invite" | "resend" };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const tenantId = payload.tenant_id;
  const customerId = payload.customer_id;
  const mode = payload.mode ?? "invite";
  if (!tenantId || !customerId) return json(400, { error: "tenant_id and customer_id are required" });

  if (!isServiceCall) {
    const { data: canManage } = await asCaller.rpc("user_has_permission", {
      target_tenant_id: tenantId,
      permission_code: "customers.portal.manage",
    });
    if (!canManage) return json(403, { error: "Missing permission customers.portal.manage" });
  }

  // Load customer
  const { data: cust, error: cErr } = await admin
    .from("customers")
    .select("id, tenant_id, full_name, first_name, last_name, email, linked_profile_id")
    .eq("id", customerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (cErr) return json(500, { error: cErr.message });
  if (!cust) return json(404, { error: "Customer not found" });
  const email = (cust.email ?? "").trim().toLowerCase();
  if (!email) return json(400, { error: "Customer has no email address" });

  // Inviter name for the email copy
  let inviterName: string | null = null;
  try {
    if (!userRes?.user) throw new Error("service call");
    const { data: inviter } = await admin
      .from("profiles")
      .select("full_name,email")
      .eq("auth_user_id", userRes.user.id)
      .maybeSingle();
    inviterName = (inviter?.full_name as string | null) ?? (inviter?.email as string | null) ?? null;
  } catch { /* ignore */ }

  // 1. Find or create the auth user
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
  let authUserId: string | null = existing?.id ?? null;
  const fullName = cust.full_name || [cust.first_name, cust.last_name].filter(Boolean).join(" ").trim() || null;

  if (!authUserId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        full_name: fullName,
        invited_tenant_id: tenantId,
        invited_by_name: inviterName,
        customer_id: cust.id,
      },
    });
    if (createErr) return json(500, { error: `Create user failed: ${createErr.message}` });
    authUserId = created.user?.id ?? null;
  }
  if (!authUserId) return json(500, { error: "Could not resolve auth user id" });

  // 2. Ensure profiles row (user_type = 'customer')
  const { data: prof } = await admin
    .from("profiles")
    .select("id, user_type")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  let profileId = prof?.id as string | undefined;
  if (!profileId) {
    const { data: created, error: pErr } = await admin
      .from("profiles")
      .insert({ auth_user_id: authUserId, email, full_name: fullName, user_type: "customer" })
      .select("id")
      .single();
    if (pErr) return json(500, { error: `Profile: ${pErr.message}` });
    profileId = created.id;
  }

  // 3. Link customer + enable portal access
  const { error: linkErr } = await admin
    .from("customers")
    .update({ linked_profile_id: profileId, portal_access_enabled: true, signup_status: "active" })
    .eq("id", cust.id);
  if (linkErr) return json(500, { error: `Link: ${linkErr.message}` });

  // 4. Send branded invite email
  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  let appUrl: string;
  try {
    appUrl = await resolveTenantAppUrl(admin, tenantId, origin || null);
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }

  let emailSent = true;
  let emailError: string | null = null;
  try {
    const actionUrl = await generateTenantActionUrl(admin, "invite", email, appUrl, "/reset-password", {
      full_name: fullName,
      invited_tenant_id: tenantId,
      invited_by_name: inviterName,
      customer_id: cust.id,
    });
    const sent = await sendAuthEmail({
      admin, tenantId, action: "invite", recipient: email, actionUrl, inviterName,
    });
    emailSent = sent.ok;
    if (!sent.ok) emailError = sent.error;
  } catch (e) {
    emailSent = false;
    emailError = (e as Error).message;
  }

  // 5. Log a notification_event so it shows in the customer's comms trail
  try {
    await admin.from("notification_events").insert({
      tenant_id: tenantId,
      event_type: "portal_invited",
      customer_id: cust.id,
      payload: { email, mode, sent: emailSent },
      status: emailSent ? "sent" : "failed",
    });
  } catch { /* ignore */ }

  return json(200, {
    ok: true,
    auth_user_id: authUserId,
    profile_id: profileId,
    resent: !!existing,
    email_sent: emailSent,
    email_error: emailError,
  });
});