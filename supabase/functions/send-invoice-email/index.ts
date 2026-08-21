// Sends an invoice PDF to the customer's email via the tenant's SMTP settings.
// Called by admins from the invoice detail page ("Send" / "Resend") and by the
// reminder cron (kind="reminder"). Logs to email_log + invoice_events.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { guardSend } from "../_shared/send-guard.ts";
import { loadTenantBrand, renderBrandedHtml } from "../_shared/comms-transport.ts";


const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "";

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

const DEFAULT_SUBJECT_SEND = "Invoice {{invoice.invoice_number}} from {{tenant.name}}";
const DEFAULT_BODY_SEND =
  "Hi {{customer.full_name}},\n\n" +
  "Please find your invoice {{invoice.invoice_number}} attached, due {{invoice.due_date}}.\n" +
  "Total: R{{invoice.total}}   Balance due: R{{invoice.balance_due}}\n\n" +
  "View online: {{invoice.public_url}}\n\n" +
  "Thank you,\n{{tenant.name}}";
const DEFAULT_SUBJECT_REMINDER = "Reminder: invoice {{invoice.invoice_number}} outstanding";
const DEFAULT_BODY_REMINDER =
  "Hi {{customer.full_name}},\n\n" +
  "This is a friendly reminder that invoice {{invoice.invoice_number}} " +
  "(balance R{{invoice.balance_due}}) is due on {{invoice.due_date}}.\n\n" +
  "View online: {{invoice.public_url}}\n\n" +
  "Thank you,\n{{tenant.name}}";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j(405, { error: "Method not allowed" });

  let body: any;
  try { body = await req.json(); } catch { return j(400, { error: "Invalid JSON" }); }
  const invoiceId: string | undefined = body?.invoice_id;
  const kind: "send" | "reminder" = body?.kind === "reminder" ? "reminder" : "send";
  const overrideTo: string | undefined = body?.to;
  if (!invoiceId) return j(400, { error: "invoice_id required" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth: cron/system calls (service-role) skip permission check; user calls must
  // hold `invoices.send`.
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceCall = authHeader.includes(SERVICE_KEY);
  let callerAuth: string | null = null;
  if (!isServiceCall) {
    if (!authHeader) return j(401, { error: "Missing Authorization" });
    callerAuth = authHeader;
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await caller.auth.getUser();
    if (!u?.user) return j(401, { error: "Not authenticated" });
    const { data: inv } = await caller.from("invoices").select("tenant_id").eq("id", invoiceId).maybeSingle();
    if (!inv) return j(404, { error: "Invoice not found or access denied" });
    const { data: allowed } = await caller.rpc("user_has_permission", {
      target_tenant_id: inv.tenant_id,
      permission_code: "invoices.send",
    });
    if (!allowed) return j(403, { error: "Missing invoices.send permission" });
  }

  // Load invoice + related bits via admin
  const { data: inv, error: invErr } = await admin
    .from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (invErr) return j(500, { error: invErr.message });
  if (!inv) return j(404, { error: "Invoice not found" });
  if (inv.status === "draft") return j(400, { error: "Issue the invoice before sending." });

  const [{ data: customer }, { data: smtp }, { data: tenant }] = await Promise.all([
    admin.from("customers").select("id, full_name, email, notify_email").eq("id", inv.customer_id).maybeSingle(),
    admin.from("email_transport_settings").select("*").eq("tenant_id", inv.tenant_id).maybeSingle(),
    admin.from("tenants").select("id, name, app_url").eq("id", inv.tenant_id).maybeSingle(),
  ]);

  const recipient = overrideTo || customer?.email;
  if (!recipient) return j(400, { error: "Customer has no email address on file." });
  if (!overrideTo && customer?.notify_email === false) {
    return j(400, { error: "Customer has opted out of email notifications." });
  }
  if (!smtp?.smtp_host || !smtp?.smtp_port || !smtp?.from_email) {
    return j(400, { error: "SMTP is not configured. Set it up in Settings → Email server." });
  }

  const publicUrl = APP_BASE_URL ? `${APP_BASE_URL.replace(/\/$/, "")}/i/${inv.public_view_token}` : `/i/${inv.public_view_token}`;
  const ctx = {
    tenant, customer,
    invoice: {
      ...inv,
      total: Number(inv.total).toFixed(2),
      balance_due: Number(inv.balance_due).toFixed(2),
      public_url: publicUrl,
    },
  };
  const subjTpl = kind === "reminder" ? DEFAULT_SUBJECT_REMINDER : DEFAULT_SUBJECT_SEND;
  const bodyTpl = kind === "reminder" ? DEFAULT_BODY_REMINDER : DEFAULT_BODY_SEND;
  const subject = render(subjTpl, ctx);
  const text = render(bodyTpl, ctx);
  const brand = await loadTenantBrand(admin, inv.tenant_id);
  const html = renderBrandedHtml(brand, tenant?.name ?? "Sloppy Kisses", text, {
    heading: kind === "reminder"
      ? `Reminder: invoice ${inv.invoice_number}`
      : `Invoice ${inv.invoice_number}`,
    preheader: `Balance due R${Number(inv.balance_due).toFixed(2)}`,
  });


  // Get PDF bytes by invoking generate-invoice-pdf.
  const pdfRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-invoice-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // The PDF function checks RLS via the caller's auth. For system/reminder
      // calls we use the service role directly.
      Authorization: callerAuth ?? `Bearer ${SERVICE_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ invoice_id: inv.id }),
  });
  if (!pdfRes.ok) {
    const errBody = await pdfRes.text();
    return j(502, { error: `PDF generation failed: ${errBody}` });
  }
  const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());

  // Send via SMTP
  let ok = false;
  let error: string | null = null;
  let providerId: string | null = null;

  // GLOBAL SEND LOCK — evaluated immediately before the SMTP handshake.
  const gate = await guardSend(admin, {
    tenantId: inv.tenant_id,
    recipient,
    subject,
    templateCode: kind === "reminder" ? "invoice_reminder" : "invoice_send",
    customerId: inv.customer_id ?? null,
    invoiceId: inv.id,
  });
  if (!gate.allowed) {
    // guardSend already wrote the [BLOCKED] email_log row.
    return j(200, { ok: false, blocked: true, error: gate.reason });
  }

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
        filename: `${inv.invoice_number}.pdf`,
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

  // Log to email_log
  await admin.from("email_log").insert({
    tenant_id: inv.tenant_id,
    customer_id: inv.customer_id,
    invoice_id: inv.id,
    template_code: kind === "reminder" ? "invoice_reminder" : "invoice_send",
    to_email: recipient,
    subject,
    status: ok ? "sent" : "failed",
    provider_message_id: providerId,
    error_message: error,
    sent_at: ok ? new Date().toISOString() : null,
  } as any);

  if (!ok) return j(502, { ok: false, error });

  // Bump send_count + audit event (as System actor)
  await admin.rpc("mark_invoice_sent", { p_invoice_id: inv.id, p_recipient: recipient, p_kind: kind });

  return j(200, { ok: true });
});