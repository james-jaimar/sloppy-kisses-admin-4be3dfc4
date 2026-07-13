// Invite a new user to the current tenant.
// - Verifies the caller is signed in and has `users.manage` in the target tenant.
// - Creates or reuses a Supabase auth user (sends invite email if new).
// - Ensures a public.profiles row exists.
// - Creates/reactivates a public.tenant_users row.
// - Replaces public.user_roles with the requested role ids.

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

  // Look up inviter display name (best-effort) so the branded email can say
  // "James invited you to Sloppy Kisses".
  let inviterName: string | null = null;
  try {
    const { data: inviter } = await admin
      .from("profiles")
      .select("full_name,email")
      .eq("auth_user_id", userRes.user.id)
      .maybeSingle();
    inviterName = (inviter?.full_name as string | null) ?? (inviter?.email as string | null) ?? null;
  } catch { /* ignore */ }

  let payload: { tenant_id?: string; email?: string; full_name?: string; role_ids?: string[] };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const tenantId = payload.tenant_id;
  const email = (payload.email ?? "").trim().toLowerCase();
  const fullName = (payload.full_name ?? "").trim();
  const roleIds = payload.role_ids ?? [];
  const mode = (payload as any).mode as string | undefined;
  if (!tenantId || !email) return json(400, { error: "tenant_id and email are required" });

  // Caller must have users.manage in the target tenant (checked via caller's JWT + RLS-safe SECURITY DEFINER fn).
  const { data: canManage, error: permErr } = await asCaller.rpc("user_has_permission", {
    target_tenant_id: tenantId,
    permission_code: "users.manage",
  });
  if (permErr) return json(500, { error: permErr.message });
  if (!canManage) return json(403, { error: "You don't have permission to manage users in this tenant." });

  // 1. Find or create the auth user.
  let authUserId: string | null = null;
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);

  // Resolve the tenant's own public URL for the invite link.
  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  let appUrl: string;
  try {
    appUrl = await resolveTenantAppUrl(admin, tenantId, origin || null);
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
  const next = "/reset-password";

  if (mode === "resend") {
    // Generate a fresh invite link (no Supabase-sent email) and deliver it via tenant SMTP.
    try {
      const actionUrl = await generateTenantActionUrl(admin, "invite", email, appUrl, next, {
        full_name: fullName || null,
        invited_tenant_id: tenantId,
        invited_by_name: inviterName,
      });
      const sent = await sendAuthEmail({
        admin, tenantId, action: "invite", recipient: email, actionUrl, inviterName,
      });
      if (!sent.ok) return json(500, { error: `Resend failed: ${sent.error}` });
      return json(200, { ok: true, resent: true, auth_user_id: existing?.id ?? null });
    } catch (e) {
      return json(500, { error: `Resend failed: ${(e as Error).message}` });
    }
  }
  if (existing) {
    authUserId = existing.id;
  } else {
    // Create the auth user without sending Supabase's default email.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        full_name: fullName || null,
        invited_tenant_id: tenantId,
        invited_by_name: inviterName,
      },
    });
    if (createErr) return json(500, { error: `Create user failed: ${createErr.message}` });
    authUserId = created.user?.id ?? null;
  }
  if (!authUserId) return json(500, { error: "Could not resolve auth user id" });

  // 2. Ensure a profile row exists.
  const { data: prof } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  let profileId = prof?.id as string | undefined;
  if (!profileId) {
    const { data: created, error: pErr } = await admin
      .from("profiles")
      .insert({
        auth_user_id: authUserId,
        email,
        full_name: fullName || null,
        user_type: "staff",
      })
      .select("id")
      .single();
    if (pErr) return json(500, { error: `Profile: ${pErr.message}` });
    profileId = created.id;
  }

  // 3. Ensure tenant_users row.
  const { data: tu } = await admin
    .from("tenant_users")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("profile_id", profileId)
    .maybeSingle();

  let tenantUserId = tu?.id as string | undefined;
  if (!tenantUserId) {
    const { data: created, error: tuErr } = await admin
      .from("tenant_users")
      .insert({ tenant_id: tenantId, profile_id: profileId, status: "active" })
      .select("id")
      .single();
    if (tuErr) return json(500, { error: `Tenant user: ${tuErr.message}` });
    tenantUserId = created.id;
  } else if (tu?.status !== "active") {
    await admin.from("tenant_users").update({ status: "active" }).eq("id", tenantUserId);
  }

  // 4. Replace role set.
  if (roleIds.length) {
    await admin.from("user_roles").delete().eq("tenant_user_id", tenantUserId);
    const { error: rErr } = await admin
      .from("user_roles")
      .insert(roleIds.map((role_id) => ({ tenant_user_id: tenantUserId!, role_id })));
    if (rErr) return json(500, { error: `Roles: ${rErr.message}` });
  }

  // 5. Send the branded invite email via tenant SMTP (only for brand-new invites).
  let emailSent = true;
  let emailError: string | null = null;
  if (!existing) {
    try {
      const actionUrl = await generateTenantActionUrl(admin, "invite", email, appUrl, next, {
        full_name: fullName || null,
        invited_tenant_id: tenantId,
        invited_by_name: inviterName,
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
  }

  return json(200, {
    ok: true,
    tenant_user_id: tenantUserId,
    profile_id: profileId,
    invited: !existing,
    email_sent: emailSent,
    email_error: emailError,
  });
});