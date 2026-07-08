// Notification dispatcher — resolves message templates, renders the body,
// sends via provider (Resend for email; WhatsApp/SMS stubbed), and marks
// the notification_events row sent/failed.
//
// Trigger with `supabase.functions.invoke("send-notifications")` or via cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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

async function sendEmail(from: string, to: string, subject: string, text: string) {
  if (!RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY not configured", id: null };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.message ?? `HTTP ${res.status}`, id: null };
  return { ok: true, error: null, id: body?.id ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: events, error } = await sb
    .from("notification_events")
    .select("*")
    .eq("status", "pending")
    .limit(20);
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

      const ctx = {
        tenant: tenantRes.data,
        customer,
        booking: bookingRes.data,
        invoice: invoiceRes.data,
        pet: petRes.data,
        vaccine: ev.payload?.vaccine ?? {},
        payload: ev.payload,
      };
      const subject = tpl.subject ? render(tpl.subject, ctx) : null;
      const body = render(tpl.body, ctx);

      if (ev.channel === "email") {
        const from = `${settings?.from_name ?? "Sloppy Kisses"} <${settings?.from_email ?? "onboarding@resend.dev"}>`;
        const result = await sendEmail(from, recipient, subject ?? "(no subject)", body);
        if (result.ok) {
          sent++;
          await sb.from("notification_events").update({
            status: "sent", sent_at: new Date().toISOString(), subject, body_rendered: body,
            recipient_email: recipient, template_key: `${tpl.event_code}:${tpl.channel}`,
            provider_message_id: result.id, attempts: (ev.attempts ?? 0) + 1,
          }).eq("id", ev.id);
        } else {
          failed++;
          await sb.from("notification_events").update({
            status: "failed", error: result.error, subject, body_rendered: body,
            recipient_email: recipient, attempts: (ev.attempts ?? 0) + 1,
          }).eq("id", ev.id);
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