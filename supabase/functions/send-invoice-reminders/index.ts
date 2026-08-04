// Daily reminder dispatcher — for every tenant with reminder_days configured,
// find unpaid invoices whose overdue offset matches one of the tenant's
// reminder days, then invoke send-invoice-email in reminder mode.
//
// Idempotency: we skip an invoice if last_reminder_offset already equals the
// current offset. Manual "Send/Resend" bumps send_count but never touches
// last_reminder_offset, so it doesn't block reminders.
//
// Trigger: pg_cron daily at 08:00 SAST (06:00 UTC).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const j = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function daysBetween(dueDate: string, today: Date): number {
  const due = new Date(dueDate + "T00:00:00Z");
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.round((t.getTime() - due.getTime()) / 86_400_000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const today = new Date();

  // Load reminder policy per tenant
  const { data: settings, error: sErr } = await admin
    .from("invoicing_settings")
    .select("tenant_id, reminder_days");
  if (sErr) return j(500, { error: sErr.message });

  const tenantOffsets = new Map<string, number[]>();
  for (const s of settings ?? []) {
    const arr = Array.isArray(s.reminder_days) ? s.reminder_days.map((n: any) => Number(n)).filter((n) => Number.isFinite(n)) : [];
    if (arr.length) tenantOffsets.set(s.tenant_id, arr);
  }
  if (!tenantOffsets.size) return j(200, { processed: 0, sent: 0, skipped: 0, reason: "no reminder policies configured" });

  // Unpaid, issued invoices, past due, not paused
  const { data: invoices, error: iErr } = await admin
    .from("invoices")
    .select("id, tenant_id, customer_id, due_date, status, balance_due, reminders_paused, last_reminder_offset")
    .in("status", ["sent", "part_paid", "overdue"])
    .eq("reminders_paused", false)
    .gt("balance_due", 0);
  if (iErr) return j(500, { error: iErr.message });

  // Customers on collections hold (dispute or payment arrangement) get no chasers.
  const { data: heldCustomers } = await admin
    .from("customers")
    .select("id")
    .eq("collections_hold", true);
  const held = new Set((heldCustomers ?? []).map((c: any) => c.id));

  let processed = 0, sent = 0, failed = 0, skipped = 0;
  const details: any[] = [];

  for (const inv of invoices ?? []) {
    processed++;
    if (held.has((inv as any).customer_id)) { skipped++; continue; }
    const offsets = tenantOffsets.get(inv.tenant_id);
    if (!offsets || !inv.due_date) { skipped++; continue; }
    const overdueDays = daysBetween(inv.due_date, today);
    if (!offsets.includes(overdueDays)) { skipped++; continue; }
    if (inv.last_reminder_offset === overdueDays) { skipped++; continue; }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-invoice-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({ invoice_id: inv.id, kind: "reminder" }),
    });
    const ok = res.ok;
    const body = await res.json().catch(() => ({}));
    if (ok) {
      sent++;
      await admin
        .from("invoices")
        .update({ last_reminder_at: new Date().toISOString(), last_reminder_offset: overdueDays })
        .eq("id", inv.id);
      // Mirror to notification_events so the Comms inbox shows one unified
      // timeline per customer instead of two silos.
      await admin.from("notification_events").insert({
        tenant_id: inv.tenant_id,
        invoice_id: inv.id,
        event_type: "invoice_reminder",
        channel: "email",
        status: "sent",
        sent_at: new Date().toISOString(),
        subject: `Reminder: invoice ${overdueDays >= 0 ? overdueDays : 0} days overdue`,
      });
    } else {
      failed++;
      details.push({ invoice_id: inv.id, error: body?.error ?? `HTTP ${res.status}` });
    }
  }

  return j(200, { processed, sent, failed, skipped, details });
});