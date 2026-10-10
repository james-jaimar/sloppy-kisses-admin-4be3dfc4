// Public (anonymous) grooming booking request — in-house parlour or mobile van.
// Prices and durations are re-derived server-side from the live price list, the
// chosen slot is re-checked against live availability, and a pending-review
// booking_requests row is created for staff. Nothing is confirmed or invoiced here.
// Always returns a neutral { ok: true } so it can't be used to probe emails.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SIZES = new Set(["xsmall", "small", "medium", "large", "xlarge", "xxlarge"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

interface PetInput { name?: string; species?: string; size?: string; breed?: string; package_code?: string; addon_codes?: string[] }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const kind = body.kind === "mobile" ? "mobile" : "inhouse";
  const email = clip(body.email, 200).toLowerCase();
  const firstName = clip(body.first_name, 80);
  const lastName = clip(body.last_name, 80);
  const mobile = clip(body.mobile, 30);
  const day = clip(body.date, 10);
  const time = clip(body.time, 5);
  const address = clip(body.address_text, 300);
  const pets: PetInput[] = (Array.isArray(body.pets) ? body.pets : []).filter((p: PetInput) => clip(p?.name, 60));

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "invalid_email" }, 400);
  if (!firstName || !lastName) return json({ error: "name_required" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return json({ error: "slot_required" }, 400);
  if (pets.length === 0 || pets.length > 4) return json({ error: "pets_required" }, 400);
  if (kind === "mobile" && address.length < 6) return json({ error: "address_required" }, 400);
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

  // Re-price from the live list
  const { data: cat } = await admin.rpc("public_grooming_catalog", { p_tenant_id: tenant.id });
  const packages: any[] = cat?.packages ?? [];
  const addons: any[] = (cat?.addons ?? []).filter((a: any) => a.kind !== "travel");
  let estimate = 0;
  let longest = 0;
  const lines = [];
  for (const p of pets) {
    const pkg = p.package_code ? packages.find((x) => x.code === p.package_code) : null;
    const extras = (p.addon_codes ?? []).map((c) => addons.find((a) => a.code === c)).filter(Boolean);
    if (!pkg && extras.length === 0) return json({ error: "service_required" }, 400);
    if (!pkg && extras.some((a: any) => !a.bookable_standalone)) return json({ error: "extra_needs_package" }, 400);
    const mins = Number(pkg?.expected_minutes ?? 0) + extras.reduce((s: number, a: any) => s + Number(a.duration_minutes ?? 0), 0);
    longest = Math.max(longest, mins || 30);
    const price = Number(pkg?.price_zar ?? 0) + extras.reduce((s: number, a: any) => s + Number(a.price_zar), 0);
    estimate += price;
    lines.push({ pkg, extras, mins, price });
  }

  // Re-check the slot: enough stations/vans free for every dog at that time
  const { data: slots } = await admin.rpc("public_grooming_slots", {
    p_tenant_id: tenant.id, p_day: day, p_kind: kind, p_minutes: longest,
  });
  const hit = (slots?.slots ?? []).find((s: any) => s.time === time);
  const needed = kind === "mobile" ? 1 : pets.length;
  if (!hit || Number(hit.free) < needed) return json({ error: "slot_taken" }, 409);

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

  const startAt = `${day}T${time}:00+02:00`;
  const endAt = new Date(Date.parse(startAt) + longest * 60000).toISOString();
  const { error: rErr } = await admin.from("booking_requests").insert({
    tenant_id: tenant.id, customer_id: customerId, pet_id: petIds[0] ?? null,
    kind: "new", source: "website_form",
    service_type: kind === "mobile" ? "grooming_mobile" : "grooming_inhouse",
    status: "pending_review", preferred_start_at: startAt, preferred_end_at: endAt,
    customer_notes: clip(body.notes, 1000) || null,
    request_payload: {
      channel: "public_booking_page", grooming_mode: kind,
      contact: { first_name: firstName, last_name: lastName, email, mobile: mobile || null },
      date: day, time, duration_minutes: longest,
      address_text: kind === "mobile" ? address : null,
      pets: pets.map((p, i) => ({
        id: petIds[i], name: clip(p.name, 60), species: p.species ?? "dog", size: p.size ?? null,
        breed: clip(p.breed, 80) || null,
        package_code: lines[i].pkg?.code ?? null, package_name: lines[i].pkg?.name ?? null,
        addon_codes: lines[i].extras.map((a: any) => a.code), minutes: lines[i].mins, price_zar: lines[i].price,
      })),
      estimate_zar: Math.round(estimate * 100) / 100,
    },
  } as any);
  if (rErr) { console.error(rErr); return json({ error: "request_failed" }, 500); }
  return json({ ok: true });
});
