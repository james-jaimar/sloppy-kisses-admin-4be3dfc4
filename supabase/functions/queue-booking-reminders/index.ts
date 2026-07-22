// Daily cron: enqueue a booking_reminder_24h notification event for every
// booking starting ~24 hours from now that doesn't already have one.
// Idempotent — safe to run multiple times per day.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const now = new Date();
  const from = new Date(now.getTime() + 23 * 3600_000).toISOString();
  const to = new Date(now.getTime() + 25 * 3600_000).toISOString();

  const { data: bookings, error } = await admin
    .from("bookings")
    .select("id, tenant_id, customer_id, pet_id, start_at, status")
    .gte("start_at", from)
    .lt("start_at", to)
    .in("status", ["confirmed", "pending"]);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  let queued = 0, skipped = 0;
  for (const b of bookings ?? []) {
    const { data: existing } = await admin
      .from("notification_events")
      .select("id")
      .eq("booking_id", b.id)
      .eq("event_type", "booking_reminder_24h")
      .maybeSingle();
    if (existing) { skipped++; continue; }
    const { error: insErr } = await admin.from("notification_events").insert({
      tenant_id: b.tenant_id,
      customer_id: b.customer_id,
      pet_id: b.pet_id,
      booking_id: b.id,
      event_type: "booking_reminder_24h",
      channel: "email",
      status: "pending",
    });
    if (insErr) { skipped++; continue; }
    queued++;
  }

  // Kick the dispatcher so reminders actually go out on this run.
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-notifications`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
  } catch { /* ignore */ }

  return new Response(JSON.stringify({ queued, skipped, scanned: bookings?.length ?? 0 }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});