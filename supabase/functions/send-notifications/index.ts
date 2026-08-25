// Notification dispatcher — resolves message templates, renders the body,
// sends via the tenant's SMTP settings (same transport as auth emails),
// and marks the notification_events row sent/failed. WhatsApp/SMS stubbed.
//
// Trigger with `supabase.functions.invoke("send-notifications")` or via cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadTransport, loadTenantBrand, renderBrandedHtml, sendMail } from "../_shared/comms-transport.ts";
import { htmlToText, looksLikeHtml } from "../_shared/html-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function render(tpl: string, ctx: Record<string, any>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const parts = String(path).split(".");
    let cur: any = ctx;
    for (const p of parts) { if (cur == null) return ""; cur = cur[p]; }
    return cur == null ? "" : String(cur);
  });
}

function isQuietHours(nowUtc: Date, quietStart: string, quietEnd: string): boolean {
  const h = nowUtc.getUTCHours() + nowUtc.getUTCMinutes() / 60;
  const [sh, sm] = quietStart.split(":").map(Number);
  const [eh, em] = quietEnd.split(":").map(Number);
  const s = sh + (sm ?? 0) / 60;
  const e = eh + (em ?? 0) / 60;
  return s <= e ? h >= s && h < e : h >= s || h < e;
}
/** Reschedule payloads carry raw ISO times — expose them in SA-friendly wording. */
function fmtSaDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-ZA", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Johannesburg",
  });
  const time = d.toLocaleTimeString("en-ZA", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Johannesburg",
  });
  return `${date}, ${time}`;
}

function buildChangeCtx(payload: any): Record<string, string> {
  return {
    previous_start: fmtSaDateTime(payload?.from_start),
    new_start: fmtSaDateTime(payload?.to_start),
    previous_end: fmtSaDateTime(payload?.from_end),
    new_end: fmtSaDateTime(payload?.to_end),
    invoice_line: typeof payload?.invoice_line === "string" ? payload.invoice_line : "",
  };
}


function buildInvoiceCtx(invoice: any, brand: any): any {
  if (!invoice) return null;
  const appUrl = (brand?.app_url as string | undefined)?.replace(/\/+$/, "");
  const base = appUrl || Deno.env.get("APP_BASE_URL")?.replace(/\/+$/, "") || "";
  const public_url = invoice.public_view_token
    ? `${base}/i/${invoice.public_view_token}`
    : "";
  return {
    ...invoice,
    total: invoice.total != null ? Number(invoice.total).toFixed(2) : "",
    balance_due: invoice.balance_due != null ? Number(invoice.balance_due).toFixed(2) : "",
    public_url,
  };
}

async function logEmail(
  sb: ReturnType<typeof createClient>,
  tenantId: string,
  to: string,
  subject: string,
  status: "sent" | "failed",
  error: string | null,
  templateCode: string,
) {
  try {
    await sb.from("email_log").insert({
      tenant_id: tenantId,
      to_email: to,
      subject,
      status,
      error_message: error,
      template_code: templateCode,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    });
  } catch (e) {
    console.error("email_log insert failed:", (e as Error).message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Callers may target one booking (e.g. right after a reschedule) for instant delivery.
  let onlyBookingId: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const id = body?.booking_id;
      if (typeof id === "string" && id.length > 0) onlyBookingId = id;
    } catch { /* no body — drain everything */ }
  }

  let q = sb.from("notification_events").select("*").eq("status", "pending").limit(20);
  if (onlyBookingId) q = q.eq("booking_id", onlyBookingId);
  const { data: events, error } = await q;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let processed = 0, sent = 0, failed = 0, skipped = 0;
  for (const ev of events ?? []) {
    processed++;
    try {
      const [settingsRes, tenantRes, custRes, bookingRes, invoiceRes, petRes, tplRes] = await Promise.all([
        sb.from("comms_settings").select("*").eq("tenant_id", ev.tenant_id).maybeSingle(),
        sb.from("tenants").select("name").eq("id", ev.tenant_id).maybeSingle(),
        ev.customer_id ? sb.from("customers").select("*").eq("id", ev.customer_id).maybeSingle() : Promise.resolve({ data: null } as any),
        ev.booking_id ? sb.from("bookings").select("*").eq("id", ev.booking_id).maybeSingle() : Promise.resolve({ data: null } as any),
        ev.invoice_id ? sb.from("invoices").select("*").eq("id", ev.invoice_id).maybeSingle() : Promise.resolve({ data: null } as any),
        ev.pet_id ? sb.from("pets").select("*").eq("id", ev.pet_id).maybeSingle() : Promise.resolve({ data: null } as any),
        sb.from("message_templates").select("*").eq("tenant_id", ev.tenant_id).eq("event_code", ev.event_type).eq("channel", ev.channel).eq("is_active", true).maybeSingle(),
      ]);
      const settings = settingsRes.data;
      const tpl = tplRes.data;
      const customer = custRes.data;
      const brand = await loadTenantBrand(sb, ev.tenant_id);

      if (settings && isQuietHours(new Date(), settings.quiet_start ?? "20:00", settings.quiet_end ?? "07:00")) {
        skipped++;
        await sb.from("notification_events").update({ scheduled_for: new Date(Date.now() + 30 * 60_000).toISOString() }).eq("id", ev.id);
        continue;
      }

      if (!tpl) {
        await sb.from("notification_events").update({ status: "skipped", error: "No active template" }).eq("id", ev.id);
        skipped++;
        continue;
      }

      // Recipient
      let recipient: string | null = ev.recipient_email;
      if (!recipient) {
        if (ev.channel === "email") recipient = customer?.email ?? null;
        else recipient = customer?.mobile ?? null;
      }
      if (!recipient) {
        await sb.from("notification_events").update({ status: "skipped", error: "No recipient" }).eq("id", ev.id);
        skipped++;
        continue;
      }
      if (ev.channel === "email" && customer && customer.notify_email === false) {
        await sb.from("notification_events").update({ status: "skipped", error: "Opted out (email)" }).eq("id", ev.id);
        skipped++;
        continue;
      }

      // Pet name for booking events that carry no pet_id (booking_pets is the link).
      let pet: any = petRes.data;
      if (!pet && ev.booking_id) {
        const { data: bp } = await sb
          .from("booking_pets")
          .select("pet:pets(id, name)")
          .eq("booking_id", ev.booking_id)
          .limit(1);
        pet = (bp?.[0] as any)?.pet ?? null;
      }

      const ctx = {
        tenant: tenantRes.data,
        customer,
        booking: bookingRes.data,
        invoice: buildInvoiceCtx(invoiceRes.data, brand),
        pet,
        vaccine: ev.payload?.vaccine ?? {},
        change: buildChangeCtx(ev.payload),
        payload: ev.payload,
      };

      const tenantName = (tenantRes.data as any)?.name ?? "Sloppy Kisses";
      const fallbackSubject = `${ev.event_type} — ${tenantName}`;
      const subject = (tpl.subject ? render(tpl.subject, ctx) : "") || fallbackSubject;
      const rendered = render(tpl.body, ctx);
      const isHtml = (tpl as any).body_format === "html" || looksLikeHtml(rendered);
      // WhatsApp/SMS always get the plain-text form.
      const body = isHtml ? htmlToText(rendered) : rendered;
      const html = renderBrandedHtml(brand, tenantName, isHtml ? rendered : body, { isHtml });

      if (ev.channel === "email") {
        const transport = await loadTransport(sb, ev.tenant_id);
        if (!transport) {
          failed++;
          const errMsg = "SMTP not configured — Settings → Email Server";
          await sb.from("notification_events").update({
            status: "failed", error: errMsg, subject, body_rendered: body,
            recipient_email: recipient, attempts: (ev.attempts ?? 0) + 1,
          }).eq("id", ev.id);
          await logEmail(sb, ev.tenant_id, recipient, subject ?? "(no subject)", "failed", errMsg, `notify.${ev.event_type}`);
          continue;
        }
        const result = await sendMail(transport, recipient, subject, body, html, {
          admin: sb,
          tenantId: ev.tenant_id,
          templateCode: `notify.${ev.event_type}`,
          customerId: ev.customer_id ?? null,
          bookingId: ev.booking_id ?? null,
          invoiceId: ev.invoice_id ?? null,
        });
        if (result.ok) {
          sent++;
          await sb.from("notification_events").update({
            status: "sent", sent_at: new Date().toISOString(), subject, body_rendered: body,
            recipient_email: recipient, template_key: `${tpl.event_code}:${tpl.channel}`,
            provider_message_id: null, attempts: (ev.attempts ?? 0) + 1,
          }).eq("id", ev.id);
          await logEmail(sb, ev.tenant_id, recipient, subject, "sent", null, `notify.${ev.event_type}`);
        } else if ((result as { blocked?: boolean }).blocked) {
          // Global send lock is on and this recipient is not allowlisted.
          // Record it as blocked (not failed) so it is never silently retried.
          skipped++;
          await sb.from("notification_events").update({
            status: "blocked", error: result.error, subject, body_rendered: body,
            recipient_email: recipient, attempts: (ev.attempts ?? 0) + 1,
          }).eq("id", ev.id);
        } else {
          failed++;
          await sb.from("notification_events").update({
            status: "failed", error: result.error, subject, body_rendered: body,
            recipient_email: recipient, attempts: (ev.attempts ?? 0) + 1,
          }).eq("id", ev.id);
          await logEmail(sb, ev.tenant_id, recipient, subject, "failed", result.error, `notify.${ev.event_type}`);
        }
      } else {
        // whatsapp/sms — provider not wired yet
        await sb.from("notification_events").update({
          status: "skipped", error: `${ev.channel} provider not configured`,
          subject, body_rendered: body, recipient_phone: recipient,
          template_key: `${tpl.event_code}:${tpl.channel}`,
        }).eq("id", ev.id);
        skipped++;
      }
    } catch (e) {
      failed++;
      await sb.from("notification_events").update({ status: "failed", error: (e as Error).message, attempts: (ev.attempts ?? 0) + 1 }).eq("id", ev.id);
    }
  }

  return new Response(JSON.stringify({ processed, sent, failed, skipped }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});