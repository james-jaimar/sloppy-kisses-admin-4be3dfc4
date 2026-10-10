// Public (anonymous) Hotel & Cattery booking request.
// - Accepts stay dates, pets, accommodation choices, add-ons and contact details.
// - Finds or creates the customer by email (never reveals which happened).
// - Creates basic pet records for new pets and a booking_requests row
//   (kind='new', source='website_form', status='pending_review') for staff to
//   review and convert — the booking is NOT confirmed until staff approve it.
// - Always returns a neutral { ok: true } so the endpoint can't be used to
//   probe whether an email is registered.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SIZES = new Set(["xsmall", "small", "medium", "large", "xlarge", "xxlarge"]);

interface PetInput {
  name?: string;
  species?: string;
  size?: string;
  breed?: string;
  accommodation?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: {
    tenant_slug?: string;
    first_name?: string; last_name?: string; email?: string; mobile?: string;
    check_in?: string; check_out?: string;
    pets?: PetInput[];
    addons?: { code?: string; quantity?: number }[];
    pickup_required?: boolean; dropoff_required?: boolean;
    address_text?: string;
    notes?: string;
    estimate_zar?: number;
  };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const email = (body.email ?? "").trim().toLowerCase();
  const firstName = (body.first_name ?? "").trim();
  const lastName = (body.last_name ?? "").trim();
  const mobile = (body.mobile ?? "").trim();
  const checkIn = (body.check_in ?? "").trim();
  const checkOut = (body.check_out ?? "").trim();
  const pets = (body.pets ?? []).filter((p) => (p.name ?? "").trim());

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "invalid_email" }, 400);
  if (!firstName || !lastName) return json({ error: "name_required" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    return json({ error: "dates_required" }, 400);
  }
  if (checkOut <= checkIn) return json({ error: "checkout_after_checkin" }, 400);
  const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000);
  if (nights < 1 || nights > 90) return json({ error: "stay_too_long" }, 400);
  if (pets.length === 0 || pets.length > 6) return json({ error: "pets_required" }, 400);
  for (const p of pets) {
    if (p.size && !SIZES.has(p.size)) return json({ error: "invalid_size" }, 400);
  }

  // Resolve tenant: slug if given, else the sole active tenant.
  let tenant: { id: string; name: string } | null = null;
  const tenantSlug = (body.tenant_slug ?? "").trim().toLowerCase();
  if (tenantSlug) {
    const { data } = await admin.from("tenants").select("id, name").eq("slug", tenantSlug).eq("status", "active").maybeSingle();
    tenant = data ?? null;
  } else {
    const { data } = await admin.from("tenants").select("id, name").eq("status", "active").order("created_at", { ascending: true }).limit(2);
    if (data && data.length === 1) tenant = data[0];
  }
  if (!tenant) return json({ error: "tenant_not_found" }, 400);

  // Re-check house capacity server-side so a full house can't be overbooked.
  const hasCat = pets.some((p) => (p.species ?? "").toLowerCase().startsWith("cat"));
  const species = hasCat && pets.every((p) => (p.species ?? "").toLowerCase().startsWith("cat")) ? "cat" : "dog";
  const { data: avail } = await admin.rpc("hotel_house_availability", {
    p_tenant_id: tenant.id,
    p_start: checkIn,
    p_end: checkOut,
    p_species: species,
  });
  const full = (avail ?? []).filter(
    (r: any) => Number(r.capacity) > 0 && Number(r.used) + pets.length > Number(r.capacity),
  );
  if (full.length > 0) return json({ error: "fully_booked", nights: full.map((r: any) => r.day) }, 409);

  // Find or create the customer — the response never reveals which path was taken.
  const fullName = `${firstName} ${lastName}`.trim();
  let customerId: string;
  const { data: existing } = await admin
    .from("customers")
    .select("id")
    .eq("tenant_id", tenant.id)
    .ilike("email", email)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();

  if (existing) {
    customerId = existing.id;
  } else {
    const { data: custNum } = await admin.rpc("next_customer_number", { target_tenant_id: tenant.id });
    const { data: cust, error: cErr } = await admin
      .from("customers")
      .insert({
        tenant_id: tenant.id,
        customer_number: custNum ?? null,
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        email,
        mobile: mobile || null,
        signup_status: "pending_review",
        portal_access_enabled: false,
      } as any)
      .select("id")
      .maybeSingle();
    if (cErr || !cust) return json({ error: cErr?.message ?? "customer_failed" }, 500);
    customerId = cust.id;
  }

  // Create basic pet records (skip if a pet with the same name already exists for this customer).
  const petIds: string[] = [];
  for (const p of pets) {
    const pName = (p.name ?? "").trim();
    const pSpecies = (p.species ?? "").toLowerCase().startsWith("cat") ? "cat" : "dog";
    const { data: existingPet } = await admin
      .from("pets")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("customer_id", customerId)
      .ilike("name", pName)
      .limit(1)
      .maybeSingle();
    if (existingPet) { petIds.push(existingPet.id); continue; }
    const { data: pet, error: pErr } = await admin
      .from("pets")
      .insert({
        tenant_id: tenant.id,
        customer_id: customerId,
        name: pName,
        species: pSpecies,
        size: p.size && SIZES.has(p.size) ? p.size : null,
        breed: (p.breed ?? "").trim() || null,
        status: "active",
      } as any)
      .select("id")
      .maybeSingle();
    if (pErr || !pet) return json({ error: pErr?.message ?? "pet_failed" }, 500);
    petIds.push(pet.id);
  }

  const startAt = `${checkIn}T14:00:00+02:00`;
  const endAt = `${checkOut}T10:00:00+02:00`;

  const { error: rErr } = await admin.from("booking_requests").insert({
    tenant_id: tenant.id,
    customer_id: customerId,
    pet_id: petIds[0] ?? null,
    kind: "new",
    source: "website_form",
    service_type: species === "cat" ? "hotel_cat" : "hotel_dog",
    status: "pending_review",
    preferred_start_at: startAt,
    preferred_end_at: endAt,
    customer_notes: (body.notes ?? "").trim() || null,
    request_payload: {
      channel: "public_booking_page",
      contact: { first_name: firstName, last_name: lastName, email, mobile: mobile || null },
      check_in: checkIn,
      check_out: checkOut,
      nights,
      pets: pets.map((p, i) => ({
        id: petIds[i],
        name: (p.name ?? "").trim(),
        species: (p.species ?? "dog").trim(),
        size: p.size ?? null,
        breed: (p.breed ?? "").trim() || null,
        accommodation: (p.accommodation ?? "").trim() || null,
      })),
      addons: (body.addons ?? [])
        .filter((a) => a.code)
        .map((a) => ({ code: a.code, quantity: Math.max(1, Number(a.quantity) || 1) })),
      pickup_required: Boolean(body.pickup_required),
      dropoff_required: Boolean(body.dropoff_required),
      address_text: (body.address_text ?? "").trim() || null,
      estimate_zar: typeof body.estimate_zar === "number" ? Math.round(body.estimate_zar * 100) / 100 : null,
    },
  } as any);
  if (rErr) return json({ error: rErr.message }, 500);

  return json({ ok: true });
});
