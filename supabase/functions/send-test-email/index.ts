// Send a test email using the tenant's configured SMTP settings, then
// record the outcome on email_transport_settings.last_test_*.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { guardSend } from "../_shared/send-guard.ts";

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
  const recipient: string | undefined = body?.to;
  if (!tenantId || !recipient) return j(400, { error: "tenant_id and to required" });

  const { data: allowed } = await caller.rpc("user_has_permission", {
    target_tenant_id: tenantId,
    permission_code: "settings.email.manage",
  });
  if (!allowed) return j(403, { error: "Missing settings.email.manage permission" });

  const { data: s, error: sErr } = await admin
    .from("email_transport_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (sErr) return j(500, { error: sErr.message });
  if (!s?.smtp_host || !s?.smtp_port || !s?.from_email) {
    return j(400, { error: "SMTP host, port and from_email must be configured first" });
  }

  const secure = s.smtp_secure ?? "starttls";
  let ok = false;
  let err: string | null = null;

  // GLOBAL SEND LOCK — even the SMTP connectivity test must respect it.
  const gate = await guardSend(admin, {
    tenantId,
    recipient,
    subject: "Sloppy Kisses — SMTP test",
    templateCode: "smtp.test",
  });
  if (!gate.allowed) {
    return j(200, { ok: false, blocked: true, error: gate.reason });
  }

  try {
    const client = new SMTPClient({
      connection: {
        hostname: s.smtp_host,
        port: Number(s.smtp_port),
        tls: secure === "ssl",
        auth: s.smtp_username && s.smtp_password
          ? { username: s.smtp_username, password: s.smtp_password }
          : undefined,
      },
    });
    await client.send({
      from: s.from_name ? `${s.from_name} <${s.from_email}>` : s.from_email,
      to: recipient,
      replyTo: s.reply_to ?? undefined,
      subject: "Sloppy Kisses — SMTP test",
      content: "Your SMTP settings are working. This is a test message sent from the Sloppy Kisses admin.",
      html: "<p>Your SMTP settings are working.</p><p>This is a test message sent from the <strong>Sloppy Kisses</strong> admin.</p>",
    });
    await client.close();
    ok = true;
  } catch (e) {
    err = (e as Error).message;
  }

  await admin
    .from("email_transport_settings")
    .update({ last_test_at: new Date().toISOString(), last_test_ok: ok, last_test_error: err })
    .eq("tenant_id", tenantId);

  return j(ok ? 200 : 500, { ok, error: err });
});