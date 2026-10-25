// Lets a signed-in portal customer price a hotel stay and save it as a real quote.
// All pricing is done server-side from the tenant's rate cards, and the quote holds
// the dates for a configurable number of hours before it expires automatically.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { priceHotelExtras, type HotelExtraRate } from "../_shared/hotel-extras.ts";

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

const BodySchema = z.object({
  service_type: z.enum(["hotel_dog", "hotel_cat"]),
  pet_ids: z.array(z.string().uuid()).min(1).max(10),
  start_at: z.string().min(1),
  end_at: z.string().min(1),
  /** petId -> accommodation type code */
  pet_accommodations: z.record(z.string().uuid(), z.string().max(80)),
  notes: z.string().max(2000).nullable().optional(),
  check_in_window: z.string().max(60).nullable().optional(),
  check_out_window: z.string().max(60).nullable().optional(),
  extras: z.array(z.object({ code: z.string().min(1).max(60), quantity: z.number().int().min(1).max(100) })).max(30).optional(),
});

function nights(startAt: string, endAt: string) {
  const ms = new Date(endAt).getTime() - new Date(startAt).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return j(401, { error: "not_authenticated" });

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: userRes, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userRes?.user) return j(401, { error: "not_authenticated" });

  let raw: unknown;
  try { raw = await req.json(); } catch { return j(400, { error: "bad_json" }); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return j(400, { error: "invalid_request", details: parsed.error.flatten().fieldErrors });
  const body = parsed.data;

  const { data: profile } = await admin
    .from("profiles").select("id").eq("auth_user_id", userRes.user.id).maybeSingle();
  if (!profile) return j(403, { error: "no_profile" });

  const { data: customer } = await admin
    .from("customers")
    .select("id, tenant_id")
    .eq("linked_profile_id", profile.id)
    .eq("portal_access_enabled", true)
    .maybeSingle();
  if (!customer) return j(403, { error: "forbidden" });
  const tenantId = customer.tenant_id as string;

  // --- Settings gate ----------------------------------------------------
  const { data: wf } = await admin
    .from("hotel_workflow_settings")
    .select("portal_quotes_enabled, portal_quote_hold_hours, portal_quote_max_active")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (wf && (wf as any).portal_quotes_enabled === false) {
    return j(200, { ok: false, error: "Saving quotes online isn't available right now — please book or contact us." });
  }
  const holdHours = Math.max(1, Number((wf as any)?.portal_quote_hold_hours ?? 48) || 48);
  const maxActive = Math.max(1, Number((wf as any)?.portal_quote_max_active ?? 3) || 3);

  const { count: activeCount } = await admin
    .from("estimates")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("customer_id", customer.id)
    .eq("created_via", "portal")
    .eq("status", "sent")
    .is("booking_id", null);
  if ((activeCount ?? 0) >= maxActive) {
    return j(200, {
      ok: false,
      error: `You already have ${activeCount} saved quotes holding dates. Accept or cancel one before saving another.`,
    });
  }

  // --- Pets must belong to this customer --------------------------------
  const { data: pets } = await admin
    .from("pets")
    .select("id, name, species")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customer.id)
    .in("id", body.pet_ids);
  if (!pets || pets.length !== body.pet_ids.length) return j(403, { error: "unknown_pet" });
  const petName = new Map(pets.map((p: any) => [p.id, p.name as string]));

  // --- Price from the rate cards ---------------------------------------
  const { data: rates, error: ratesErr } = await admin
    .from("hotel_rate_cards")
    .select("accommodation_type, display_name, nightly_rate_zar, extra_pet_rate_zar, species, active")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (ratesErr) return j(200, { ok: false, error: `Could not load rates: ${ratesErr.message}` });

  const rateFor = (code: string, petSpecies: string) =>
    (rates ?? []).find((r: any) => r.accommodation_type === code && r.species === petSpecies);

  const n = nights(body.start_at, body.end_at);
  const groups = new Map<string, string[]>();
  for (const id of body.pet_ids) {
    const acc = body.pet_accommodations[id];
    if (!acc) return j(400, { error: "missing_accommodation" });
    const pet = pets.find(p => p.id === id);
    const key = `${pet?.species}|${acc}`;
    groups.set(key, [...(groups.get(key) ?? []), petName.get(id) ?? "Pet"]);
  }

  const items: { description: string; quantity: number; unit_price: number }[] = [];
  for (const [key, names] of groups) {
    const [petSpecies, acc] = key.split("|");
    const rate: any = rateFor(acc, petSpecies);
    if (!rate) {
      return j(200, {
        ok: false,
        error: `No active ${petSpecies} rate is set up for "${acc}" — please contact us or pick another accommodation.`,
      });
    }
    items.push({
      description: `${rate.display_name} — ${names[0]}`,
      quantity: n,
      unit_price: Number(rate.nightly_rate_zar),
    });
    const extras = names.length - 1;
    if (extras > 0 && Number(rate.extra_pet_rate_zar) > 0) {
      items.push({
        description: `Extra pet${extras === 1 ? "" : "s"} in ${rate.display_name} — ${names.slice(1).join(", ")}`,
        quantity: n * extras,
        unit_price: Number(rate.extra_pet_rate_zar),
      });
    }
  }
  const { data: catalog, error: catalogError } = await admin.from("hotel_surcharges")
    .select("id, code, name, price_zar, per_night").eq("tenant_id", tenantId).eq("active", true);
  if (catalogError) return j(500, { error: "Could not load hotel extras. Please try again." });
  let hotelExtras: ReturnType<typeof priceHotelExtras>;
  try {
    const dogCount = (pets as any[]).filter((p) => p.species !== "cat").length;
    hotelExtras = priceHotelExtras((catalog ?? []) as HotelExtraRate[], body.extras ?? [], body.pet_ids.length, n, body.check_out_window ?? null, dogCount);
  } catch (error) {
    return j(400, { error: error instanceof Error ? error.message : "Invalid hotel extras" });
  }
  for (const extra of hotelExtras) items.push({
    description: `${extra.name} — ${pets.map(p => p.name).join(", ")}${extra.per_night ? ` · ${extra.perPet} per pet per day` : ""}`,
    quantity: extra.billedQuantity, unit_price: Number(extra.price_zar),
  });
  const subtotal = Math.round(items.reduce((s, i) => s + i.quantity * i.unit_price, 0) * 100) / 100;

  // --- Create the quote, holding the dates ------------------------------
  const { data: num, error: numErr } = await admin.rpc("next_estimate_number", { target_tenant_id: tenantId });
  if (numErr) return j(200, { ok: false, error: numErr.message });

  const now = new Date();
  const holdExpires = new Date(now.getTime() + holdHours * 3600_000);
  const firstAcc = body.pet_accommodations[body.pet_ids[0]];

  // Saving an estimate also creates the unpaid stay so staff can collect information.
  const requestResponse = await fetch(`${SUPABASE_URL}/functions/v1/portal-create-booking`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: ANON_KEY },
    body: JSON.stringify({ service_type: body.service_type, pet_ids: body.pet_ids, start_at: body.start_at, end_at: body.end_at, notes: body.notes, hotel: { accommodation_type: body.pet_accommodations[body.pet_ids[0]], pet_accommodations: body.pet_accommodations, check_in_window: body.check_in_window, check_out_window: body.check_out_window, extras: body.extras } }),
  });
  const stay = await requestResponse.json();
  if (!requestResponse.ok || !stay.booking_id) return j(400, { ok: false, error: stay.error ?? "Could not save hotel enquiry" });

  const { data: est, error: estErr } = await admin
    .from("estimates")
    .insert({
      tenant_id: tenantId,
      customer_id: customer.id,
      estimate_number: num,
      status: "sent",
      created_via: "portal",
      booking_id: stay.booking_id,
      issue_date: now.toISOString().slice(0, 10),
      sent_at: now.toISOString(),
      service_type: body.service_type,
      start_at: body.start_at,
      end_at: body.end_at,
      accommodation_type: firstAcc,
      pet_ids: body.pet_ids,
      notes: body.notes ?? null,
      hold_expires_at: holdExpires.toISOString(),
      hold_until: holdExpires.toISOString().slice(0, 10),
      expiry_date: holdExpires.toISOString().slice(0, 10),
      extras: {
        document_kind: "estimate",
        check_in_window: body.check_in_window ?? null,
        check_out_window: body.check_out_window ?? null,
        pet_accommodations: body.pet_accommodations,
        pets: body.pet_ids.map(id => ({ pet_id: id, accommodation_type: body.pet_accommodations[id] })),
        surcharges: hotelExtras.map(extra => ({ surcharge_id: extra.id, quantity: extra.quantity, quantity_basis: extra.quantity_basis })),
        notes: body.notes ?? null,
      },
      subtotal,
      total: subtotal,
    } as any)
    .select("id, estimate_number, public_token, hold_expires_at, total")
    .single();
  if (estErr) return j(200, { ok: false, booking_id: stay.booking_id, error: `Your enquiry was saved, but the estimate could not be created: ${estErr.message}` });

  if (items.length > 0) {
    await admin.from("estimate_items").insert(
      items.map((i, idx) => ({
        tenant_id: tenantId,
        estimate_id: est.id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        line_total: Math.round(i.quantity * i.unit_price * 100) / 100,
        sort_order: idx,
      })) as any,
    );
  }

  await admin.from("hotel_booking_reviews").upsert({ tenant_id: tenantId, booking_id: stay.booking_id, estimate_id: est.id }, { onConflict: "booking_id" });

  // Email the estimate — staff approval is still required.
  let emailed = false;
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/send-quote-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify({ quote_id: est.id }),
    });
    emailed = r.ok;
  } catch { /* non-fatal */ }

  await admin
    .from("estimates")
    .update({
      hold_expires_at: holdExpires.toISOString(),
      hold_until: holdExpires.toISOString().slice(0, 10),
      expiry_date: holdExpires.toISOString().slice(0, 10),
    })
    .eq("id", est.id);

  return j(200, {
    ok: true,
    booking_id: stay.booking_id,
    quote_id: est.id,
    estimate_number: est.estimate_number,
    public_token: est.public_token,
    hold_expires_at: holdExpires.toISOString(),
    total: subtotal,
    emailed,
  });
});
