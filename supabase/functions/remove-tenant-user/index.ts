// Remove a user from the current tenant.
// - Deletes user_roles for the tenant_user
// - Deletes the tenant_users row
// - Leaves the auth.user and profile intact (they may belong to other tenants)

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

  let payload: { tenant_id?: string; tenant_user_id?: string };
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

  // Sanity: the tenant_user belongs to this tenant.
  const { data: tu } = await admin
    .from("tenant_users")
    .select("id, tenant_id, is_primary_contact")
    .eq("id", tenantUserId)
    .maybeSingle();
  if (!tu || tu.tenant_id !== tenantId) return json(404, { error: "Tenant user not found" });
  if (tu.is_primary_contact) return json(400, { error: "Cannot remove the primary contact. Assign another primary first." });

  await admin.from("user_roles").delete().eq("tenant_user_id", tenantUserId);
  const { error: delErr } = await admin.from("tenant_users").delete().eq("id", tenantUserId);
  if (delErr) return json(500, { error: `Remove failed: ${delErr.message}` });

  return json(200, { ok: true });
});