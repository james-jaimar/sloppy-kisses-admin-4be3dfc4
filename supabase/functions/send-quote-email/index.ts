// Emails a hotel quote PDF to the customer via the tenant's SMTP settings.
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

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j(405, { error: "Method not allowed" });

  let body: any;
  try { body = await req.json(); } catch { return j(400, { error: "Invalid JSON" }); }
  const quoteId: string | undefined = body?.quote_id;
  const overrideTo: string | undefined = body?.to;
  if (!quoteId) return j(400, { error: "quote_id required" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return j(401, { error: "Missing Authorization" });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: q } = await admin.from("estimates").select("*").eq("id", quoteId).maybeSingle();
  if (!q) return j(404, { error: "Quote not found" });

  const isServiceCall = authHeader.includes(SERVICE_KEY);
  if (!isServiceCall) {
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await caller.auth.getUser();
    if (!u?.user) return j(401, { error: "Not authenticated" });
    const { data: allowed } = await caller.rpc("user_has_permission", {
      target_tenant_id: q.tenant_id,
      permission_code: "invoices.send",
    });
    if (!allowed) return j(403, { error: "Missing invoices.send permission" });
  }

  const [{ data: customer }, { data: smtp }, { data: tenant }] = await Promise.all([
    admin.from("customers").select("id, full_name, email, notify_email").eq("id", q.customer_id).maybeSingle(),
    admin.from("email_transport_settings").select("*").eq("tenant_id", q.tenant_id).maybeSingle(),
    admin.from("tenants").select("id, name").eq("id", q.tenant_id).maybeSingle(),
  ]);

  const recipient = overrideTo || customer?.email;
  if (!recipient) return j(400, { error: "Customer has no email address on file." });
  if (!overrideTo && customer?.notify_email === false) {
    return j(400, { error: "Customer has opted out of email notifications." });
  }
  if (!smtp?.smtp_host || !smtp?.smtp_port || !smtp?.from_email) {
    return j(400, { error: "SMTP is not configured. Set it up in Settings → Email server." });
  }

  const subject = `Quote ${q.estimate_number} from ${tenant?.name ?? "us"}`;
  const text =
    `Hi ${customer?.full_name ?? "there"},\n\n` +
    `Thank you for your enquiry. Your quote ${q.estimate_number} is attached.\n` +
    (q.start_at ? `Stay: ${fmtDate(q.start_at)} to ${fmtDate(q.end_at)}\n` : "") +
    `Total: R${Number(q.total ?? 0).toFixed(2)}\n` +
    (q.expiry_date ? `This quote is valid until ${fmtDate(q.expiry_date)}.\n` : "") +
    `\nA 50% deposit secures the booking, with the balance due before arrival.\n\n` +
    `Thank you,\n${tenant?.name ?? ""}`;
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a2e">${
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>")
  }</div>`;

  const pdfRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-quote-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ quote_id: q.id }),
  });
  if (!pdfRes.ok) {
    let detail = await pdfRes.text();
    try { detail = JSON.parse(detail)?.error ?? detail; } catch { /* keep raw text */ }
    const reason = `PDF generation failed: ${detail}`;
    await admin.from("email_log").insert({
      tenant_id: q.tenant_id,
      customer_id: q.customer_id,
      template_code: "quote_send",
      to_email: recipient,
      subject,
      status: "failed",
      error_message: reason,
      sent_at: null,
    } as any);
    return j(200, { ok: false, error: reason });
  }
  const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());

  const gate = await guardSend(admin, {
    tenantId: q.tenant_id,
    recipient,
    subject,
    templateCode: "quote_send",
    customerId: q.customer_id ?? null,
  });
  if (!gate.allowed) return j(200, { ok: false, blocked: true, error: gate.reason });

  let ok = false;
  let error: string | null = null;
  try {
    const client = new SMTPClient({
      connection: {
        hostname: smtp.smtp_host,
        port: Number(smtp.smtp_port),
        tls: (smtp.smtp_secure ?? "starttls") === "ssl",
        auth: smtp.smtp_username && smtp.smtp_password
          ? { username: smtp.smtp_username, password: smtp.smtp_password }
          : undefined,
      },
    });
    await client.send({
      from: smtp.from_name ? `${smtp.from_name} <${smtp.from_email}>` : smtp.from_email,
      to: recipient,
      replyTo: smtp.reply_to ?? undefined,
      subject,
      content: text,
      html,
      attachments: [{
        filename: `${q.estimate_number ?? "quote"}.pdf`,
        content: pdfBytes,
        contentType: "application/pdf",
        encoding: "binary",
      }],
    });
    await client.close();
    ok = true;
  } catch (e) {
    error = (e as Error).message;
  }

  await admin.from("email_log").insert({
    tenant_id: q.tenant_id,
    customer_id: q.customer_id,
    template_code: "quote_send",
    to_email: recipient,
    subject,
    status: ok ? "sent" : "failed",
    error_message: error,
    sent_at: ok ? new Date().toISOString() : null,
  } as any);

  if (!ok) return j(502, { ok: false, error });

  // The hold on the dates starts the moment the quote is sent.
  const { data: wf } = await admin
    .from("hotel_workflow_settings")
    .select("quote_validity_days")
    .eq("tenant_id", q.tenant_id)
    .maybeSingle();
  const validityDays = Number((wf as any)?.quote_validity_days ?? 14) || 14;
  const holdUntil = new Date(Date.now() + validityDays * 86400000).toISOString().slice(0, 10);
  const firstSend = !q.sent_at;

  await admin.from("estimates").update({
    status: q.status === "draft" ? "sent" : q.status,
    sent_at: new Date().toISOString(),
    ...(firstSend || !q.hold_until ? { hold_until: holdUntil, expiry_date: holdUntil } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", q.id);

  return j(200, { ok: true });
});
