// Manage an existing tenant user: set a password directly, or edit name / email.
// Requires the caller to hold `users.manage` in the target tenant.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

  let payload: {
    tenant_id?: string;
    tenant_user_id?: string;
    password?: string;
    full_name?: string;
    email?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const tenantId = payload.tenant_id;
  const tenantUserId = payload.tenant_user_id;
  if (!tenantId || !tenantUserId) return json(400, { error: "tenant_id and tenant_user_id are required" });

  const { data: canManage, error: permErr } = await asCaller.rpc("user_has_permission", {
    target_tenant_id: tenantId,
    permission_code: "users.manage",
  });
  if (permErr) return json(500, { error: permErr.message });
  if (!canManage) return json(403, { error: "You don't have permission to manage users in this tenant." });

  const { data: tu, error: tuErr } = await admin
    .from("tenant_users")
    .select("id, tenant_id, profile_id")
    .eq("id", tenantUserId)
    .maybeSingle();
  if (tuErr) return json(500, { error: tuErr.message });
  if (!tu || tu.tenant_id !== tenantId) return json(404, { error: "User not found in this tenant." });

  const { data: prof, error: pErr } = await admin
    .from("profiles")
    .select("id, auth_user_id, email, full_name")
    .eq("id", tu.profile_id)
    .maybeSingle();
  if (pErr) return json(500, { error: pErr.message });
  if (!prof) return json(404, { error: "Profile not found." });

  const password = (payload.password ?? "").trim();
  const fullName = payload.full_name === undefined ? undefined : payload.full_name.trim();
  const email = payload.email === undefined ? undefined : payload.email.trim().toLowerCase();

  if (password && password.length < 8) {
    return json(400, { error: "Password must be at least 8 characters." });
  }
  if (email !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(400, { error: "Enter a valid email address." });
  }

  // Update the auth user (password / email), creating one if the profile has none.
  let authUserId = prof.auth_user_id as string | null;
  if (!authUserId && password) {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: email ?? (prof.email as string),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName ?? prof.full_name ?? null },
    });
    if (cErr) return json(500, { error: `Create login failed: ${cErr.message}` });
    authUserId = created.user?.id ?? null;
    if (authUserId) await admin.from("profiles").update({ auth_user_id: authUserId }).eq("id", prof.id);
  } else if (authUserId && (password || email !== undefined)) {
    const attrs: Record<string, unknown> = {};
    if (password) {
      attrs.password = password;
      attrs.email_confirm = true;
    }
    if (email !== undefined && email !== prof.email) {
      attrs.email = email;
      attrs.email_confirm = true;
    }
    if (Object.keys(attrs).length) {
      const { error: uErr } = await admin.auth.admin.updateUserById(authUserId, attrs as never);
      if (uErr) return json(500, { error: uErr.message });
    }
  }

  // Update the profile row.
  const patch: Record<string, unknown> = {};
  if (fullName !== undefined) patch.full_name = fullName || null;
  if (email !== undefined) patch.email = email;
  if (Object.keys(patch).length) {
    const { error: upErr } = await admin.from("profiles").update(patch).eq("id", prof.id);
    if (upErr) return json(500, { error: upErr.message });
  }

  return json(200, { ok: true, password_set: Boolean(password) });
});