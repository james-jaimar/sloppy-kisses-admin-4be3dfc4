// Send a preview of a message template to the tenant's configured test recipient.
// Uses a sample context so admins can see the rendered output before saving.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadTransport, loadTenantBrand, renderBrandedHtml, sendMail } from "../_shared/comms-transport.ts";
import { htmlToText, looksLikeHtml } from "../_shared/html-email.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const j = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function render(tpl: string, ctx: Record<string, any>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const parts = String(path).split(".");
    let cur: any = ctx;
    for (const p of parts) { if (cur == null) return ""; cur = cur[p]; }
    return cur == null ? "" : String(cur);
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j(405, { error: "Method not allowed" });
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return j(401, { error: "Missing Authorization" });

  let body: any;
  try { body = await req.json(); } catch { return j(400, { error: "Invalid JSON" }); }
  const { subject: subjectTpl, body: bodyTpl, body_format, event_code, tenant_id, sample, to } = body ?? {};
  if (!bodyTpl || !tenant_id) return j(400, { error: "tenant_id and body required" });

  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await caller.auth.getUser();
  if (!u?.user) return j(401, { error: "Not authenticated" });
  const { data: allowed } = await caller.rpc("user_has_permission", {
     target_tenant_id: tenant_id, permission_code: "settings.comms.manage",
  });
  if (!allowed) return j(403, { error: "Missing settings.comms.manage" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const [transport, brand, settingsRes] = await Promise.all([
    loadTransport(admin, tenant_id),
    loadTenantBrand(admin, tenant_id),
    admin.from("comms_settings").select("test_recipient").eq("tenant_id", tenant_id).maybeSingle(),
  ]);
  if (!transport) return j(400, { error: "SMTP not configured — Settings → Email Server" });
  const recipient = to || settingsRes.data?.test_recipient;
  if (!recipient) return j(400, { error: "No test recipient — set one in Settings → Comms" });

  const ctx = { tenant: { name: brand?.name ?? "Sloppy Kisses" }, ...(sample ?? {}) };
  const subject = (subjectTpl ? render(subjectTpl, ctx) : "") || `${event_code ?? "test"} — ${brand?.name ?? "Sloppy Kisses"}`;
  const rendered = render(bodyTpl, ctx);
  const isHtml = body_format === "html" || looksLikeHtml(rendered);
  const text = isHtml ? htmlToText(rendered) : rendered;
  const html = renderBrandedHtml(brand, brand?.name ?? "Sloppy Kisses", isHtml ? rendered : text, { isHtml });

  const result = await sendMail(transport, recipient, `[TEST] ${subject}`, text, html, {
    admin,
    tenantId: tenant_id,
    templateCode: `test.${event_code ?? "manual"}`,
  });
  if (!result.ok && (result as { blocked?: boolean }).blocked) {
    // guardSend already wrote the [BLOCKED] email_log row.
    return j(200, { ok: false, blocked: true, recipient, error: result.error });
  }
  await admin.from("email_log").insert({
    tenant_id, to_email: recipient, subject: `[TEST] ${subject}`,
    status: result.ok ? "sent" : "failed",
    error_message: result.ok ? null : result.error,
    template_code: `test.${event_code ?? "manual"}`,
    sent_at: result.ok ? new Date().toISOString() : null,
  });
  if (!result.ok) return j(502, { ok: false, error: result.error });
  return j(200, { ok: true, recipient });
});