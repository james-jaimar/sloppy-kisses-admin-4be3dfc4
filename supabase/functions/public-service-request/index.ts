// Public (anonymous) request for Daycare or Pick up & Drop off.
// Capacity and prices are re-checked server-side, then a pending-review
// booking_requests row is created for staff. Nothing is confirmed or invoiced.
// Returns a neutral { ok: true } so it can't be used to probe emails.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SIZES = new Set(["xsmall", "small", "medium", "large", "xlarge", "xxlarge"]);
const WEEKDAYS = new Set(["mon", "tue", "wed", "thu", "fri"]);
const DIRS = new Set(["pickup", "dropoff", "round_trip"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const service = body.service === "transport" ? "transport" : body.service === "daycare" ? "daycare" : null;
  if (!service) return json({ error: "invalid_service" }, 400);
  const email = clip(body.email, 200).toLowerCase();
  const firstName = clip(body.first_name, 80);
  const lastName = clip(body.last_name, 80);
  const mobile = clip(body.mobile, 30);
  const pets = (Array.isArray(body.pets) ? body.pets : []).filter((p: any) => clip(p?.name, 60)).slice(0, 6);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "invalid_email" }, 400);
  if (!firstName || !lastName) return json({ error: "name_required" }, 400);
  if (pets.length === 0) return json({ error: "pets_required" }, 400);
  for (const p of pets) if (p.size && !SIZES.has(p.size)) return json({ error: "invalid_size" }, 400);

  // Tenant
  let tenant: { id: string } | null = null;
  const slug = clip(body.tenant_slug, 80).toLowerCase();
  if (slug) {
    const { data } = await admin.from("tenants").select("id").eq("slug", slug).eq("status", "active").maybeSingle();
    tenant = data ?? null;
  } else {
    const { data } = await admin.from("tenants").select("id").eq("status", "active").limit(2);
    if (data && data.length === 1) tenant = data[0];
  }
  if (!tenant) return json({ error: "tenant_not_found" }, 400);

  // Service-specific validation + live re-check
  let serviceType: string;
  let startAt: string;
  let endAt: string | null = null;
  let payload: Record<string, unknown>;

  if (service === "daycare") {
    const assessment = Boolean(body.assessment);
    const day = clip(assessment ? body.assessment_date : body.start_date, 10);
    if (!isDay(day)) return json({ error: "date_required" }, 400);
    const days = (Array.isArray(body.days) ? body.days : []).map((d: unknown) => String(d)).filter((d: string) => WEEKDAYS.has(d));
    const { data: info } = await admin.rpc("public_daycare_info", { p_tenant_id: tenant.id, p_day: day });
    let plan: any = null;
    if (!assessment) {
      plan = (info?.plans ?? []).find((p: any) => p.id === body.plan_id);
      if (!plan) return json({ error: "plan_required" }, 400);
    }
    if (assessment && (info?.day_full || info?.closed || info?.weekend)) return json({ error: "day_unavailable" }, 409);
    serviceType = assessment ? "daycare_assessment" : "daycare";
    startAt = `${day}T08:00:00+02:00`;
    payload = {
      assessment, start_date: day, days,
      plan_id: plan?.id ?? null, plan_name: plan?.name ?? null, plan_price_zar: plan ? Number(plan.price) : null,
      estimate_zar: plan ? Number(plan.price) * pets.length : null,
    };
  } else {
    const day = clip(body.date, 10);
    const time = clip(body.time, 5);
    const direction = DIRS.has(body.direction) ? body.direction : null;
    const address = clip(body.address_text, 300);
    const suburb = clip(body.suburb, 80);
    if (!isDay(day) || !/^\d{2}:\d{2}$/.test(time)) return json({ error: "slot_required" }, 400);
    if (!direction) return json({ error: "direction_required" }, 400);
    if (address.length < 6) return json({ error: "address_required" }, 400);
    const { data: info } = await admin.rpc("public_transport_info", { p_tenant_id: tenant.id, p_day: day });
    if (!info || info.no_vans || info.day_full) return json({ error: "day_unavailable" }, 409);
    const fees = (info.suburb_fees ?? {}) as Record<string, number>;
    const key = Object.keys(fees).find((k) => k.toLowerCase() === suburb.toLowerCase());
    const leg = Number(key ? fees[key] : info.default_fee_zar) || 0;
    const fee = direction === "round_trip" ? leg * Number(info.round_trip_multiplier || 2) : leg;
    serviceType = "pickup_dropoff";
    startAt = `${day}T${time}:00+02:00`;
    endAt = new Date(Date.parse(startAt) + 60 * 60000).toISOString();
    payload = {
      date: day, time, direction, address_text: address, suburb: suburb || null,
      destination: clip(body.destination, 120) || null,
      return_date: isDay(clip(body.return_date, 10)) ? clip(body.return_date, 10) : null,
      return_time: /^\d{2}:\d{2}$/.test(clip(body.return_time, 5)) ? clip(body.return_time, 5) : null,
      estimate_zar: Math.round(fee * 100) / 100,
    };
  }

  // Customer
  let customerId: string;
  const { data: existing } = await admin.from("customers").select("id").eq("tenant_id", tenant.id)
    .ilike("email", email).neq("status", "archived").limit(1).maybeSingle();
  if (existing) customerId = existing.id;
  else {
    const { data: custNum } = await admin.rpc("next_customer_number", { target_tenant_id: tenant.id });
    const { data: cust, error } = await admin.from("customers").insert({
      tenant_id: tenant.id, customer_number: custNum ?? null,
      full_name: `${firstName} ${lastName}`, first_name: firstName, last_name: lastName,
      email, mobile: mobile || null, signup_status: "pending_review", portal_access_enabled: false,
    } as any).select("id").maybeSingle();
    if (error || !cust) { console.error(error); return json({ error: "customer_failed" }, 500); }
    customerId = cust.id;
  }

  // Pets
  const petIds: string[] = [];
  for (const p of pets) {
    const name = clip(p.name, 60);
    const { data: ep } = await admin.from("pets").select("id").eq("tenant_id", tenant.id)
      .eq("customer_id", customerId).ilike("name", name).limit(1).maybeSingle();
    if (ep) { petIds.push(ep.id); continue; }
    const { data: pet, error } = await admin.from("pets").insert({
      tenant_id: tenant.id, customer_id: customerId, name,
      species: String(p.species ?? "").toLowerCase().startsWith("cat") ? "cat" : "dog",
      size: p.size && SIZES.has(p.size) ? p.size : null,
      breed: clip(p.breed, 80) || null, status: "active",
    } as any).select("id").maybeSingle();
    if (error || !pet) { console.error(error); return json({ error: "pet_failed" }, 500); }
    petIds.push(pet.id);
  }

  const { error: rErr } = await admin.from("booking_requests").insert({
    tenant_id: tenant.id, customer_id: customerId, pet_id: petIds[0] ?? null,
    kind: "new", source: "website_form", service_type: serviceType,
    status: "pending_review", preferred_start_at: startAt, preferred_end_at: endAt,
    customer_notes: clip(body.notes, 1000) || null,
    request_payload: {
      channel: "public_booking_page", ...payload,
      contact: { first_name: firstName, last_name: lastName, email, mobile: mobile || null },
      pets: pets.map((p: any, i: number) => ({
        id: petIds[i], name: clip(p.name, 60), species: p.species ?? "dog", size: p.size ?? null, breed: clip(p.breed, 80) || null,
      })),
    },
  } as any);
  if (rErr) { console.error(rErr); return json({ error: "request_failed" }, 500); }
  return json({ ok: true });
});
