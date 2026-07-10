// Upsert per-tenant SMTP email transport settings using the service role,
// since the smtp_password column is not readable/writable by `authenticated`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const j = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j(405, { error: "Method not allowed" });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return j(401, { error: "Missing Authorization" });

  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: u } = await caller.auth.getUser();
  if (!u?.user) return j(401, { error: "Not authenticated" });

  let body: any;
  try { body = await req.json(); } catch { return j(400, { error: "Invalid JSON" }); }
  const tenantId: string | undefined = body?.tenant_id;
  if (!tenantId) return j(400, { error: "tenant_id required" });

  const { data: allowed } = await caller.rpc("user_has_permission", {
    target_tenant_id: tenantId,
    permission_code: "settings.email.manage",
  });
  if (!allowed) return j(403, { error: "Missing settings.email.manage permission" });

  const patch: Record<string, unknown> = {
    tenant_id: tenantId,
    provider: "smtp",
    smtp_host: body.smtp_host ?? null,
    smtp_port: body.smtp_port ?? null,
    smtp_secure: body.smtp_secure ?? "starttls",
    smtp_username: body.smtp_username ?? null,
    from_name: body.from_name ?? null,
    from_email: body.from_email ?? null,
    reply_to: body.reply_to ?? null,
  };
  if (typeof body.smtp_password === "string" && body.smtp_password.length > 0) {
    patch.smtp_password = body.smtp_password;
  }
  const { error } = await admin
    .from("email_transport_settings")
    .upsert(patch, { onConflict: "tenant_id" });
  if (error) return j(500, { error: error.message });
  return j(200, { ok: true });
});