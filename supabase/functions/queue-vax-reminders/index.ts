// Daily cron: enqueue vaccination reminder notification events at 30 days,
// 7 days and on expiry. Idempotent per pet + vaccine + event type + expiry date.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WINDOWS: Array<{ days: number; event: string }> = [
  { days: 30, event: "vax_expiring_30d" },
  { days: 7, event: "vax_expiring_7d" },
  { days: 0, event: "vax_expired" },
];

function isoDay(offsetDays: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let queued = 0, skipped = 0, scanned = 0;

  for (const w of WINDOWS) {
    const target = isoDay(w.days);
    const { data: rows, error } = await admin
      .from("vaccinations")
      .select("id, tenant_id, pet_id, vaccination_type, expiry_date, pet:pets(id, name, customer_id, status)")
      .eq("expiry_date", target);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    scanned += rows?.length ?? 0;

    for (const r of rows ?? []) {
      const pet: any = (r as any).pet;
      if (!pet || pet.status !== "active" || !pet.customer_id) { skipped++; continue; }

      const { data: existing } = await admin
        .from("notification_events")
        .select("id")
        .eq("pet_id", r.pet_id)
        .eq("event_type", w.event)
        .contains("payload", { vaccination_id: r.id })
        .maybeSingle();
      if (existing) { skipped++; continue; }

      const { error: insErr } = await admin.from("notification_events").insert({
        tenant_id: r.tenant_id,
        customer_id: pet.customer_id,
        pet_id: r.pet_id,
        event_type: w.event,
        channel: "email",
        status: "pending",
        payload: {
          vaccination_id: r.id,
          pet_name: pet.name,
          vaccine: {
            type: r.vaccination_type,
            expiry_date: r.expiry_date,
          },
        },
      });
      if (insErr) { skipped++; continue; }
      queued++;
    }
  }

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-notifications`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
  } catch { /* ignore */ }

  return new Response(JSON.stringify({ queued, skipped, scanned }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});