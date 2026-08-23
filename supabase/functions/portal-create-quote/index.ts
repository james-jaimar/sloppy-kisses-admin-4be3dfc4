// Lets a signed-in portal customer price a hotel stay and save it as a real quote.
// All pricing is done server-side from the tenant's rate cards, and the quote holds
// the dates for a configurable number of hours before it expires automatically.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

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
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customer.id)
    .in("id", body.pet_ids);
  if (!pets || pets.length !== body.pet_ids.length) return j(403, { error: "unknown_pet" });
  const petName = new Map(pets.map((p: any) => [p.id, p.name as string]));

  // --- Price from the rate cards ---------------------------------------
  const { data: rates } = await admin
    .from("hotel_rate_cards")
    .select("accommodation_type, display_name, nightly_rate_zar, extra_pet_rate_zar, species, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  const species = body.service_type === "hotel_cat" ? "cat" : "dog";
  const rateFor = (code: string) =>
    (rates ?? []).find((r: any) => r.accommodation_type === code && r.species === species);

  const n = nights(body.start_at, body.end_at);
  const groups = new Map<string, string[]>();
  for (const id of body.pet_ids) {
    const acc = body.pet_accommodations[id];
    if (!acc) return j(400, { error: "missing_accommodation" });
    groups.set(acc, [...(groups.get(acc) ?? []), petName.get(id) ?? "Pet"]);
  }

  const items: { description: string; quantity: number; unit_price: number }[] = [];
  for (const [acc, names] of groups) {
    const rate: any = rateFor(acc);
    if (!rate) return j(200, { ok: false, error: "That accommodation isn't available for these pets." });
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
  const subtotal = Math.round(items.reduce((s, i) => s + i.quantity * i.unit_price, 0) * 100) / 100;

  // --- Create the quote, holding the dates ------------------------------
  const { data: num, error: numErr } = await admin.rpc("next_estimate_number", { target_tenant_id: tenantId });
  if (numErr) return j(200, { ok: false, error: numErr.message });

  const now = new Date();
  const holdExpires = new Date(now.getTime() + holdHours * 3600_000);
  const firstAcc = body.pet_accommodations[body.pet_ids[0]];

  const { data: est, error: estErr } = await admin
    .from("estimates")
    .insert({
      tenant_id: tenantId,
      customer_id: customer.id,
      estimate_number: num,
      status: "sent",
      created_via: "portal",
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
        check_in_window: body.check_in_window ?? null,
        check_out_window: body.check_out_window ?? null,
        pet_accommodations: body.pet_accommodations,
        notes: body.notes ?? null,
      },
      subtotal,
      total: subtotal,
    } as any)
    .select("id, estimate_number, public_token, hold_expires_at, total")
    .single();
  if (estErr) return j(200, { ok: false, error: estErr.message });

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

  // Email the quote — best effort, and it must not move the hold we just set.
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
    quote_id: est.id,
    estimate_number: est.estimate_number,
    public_token: est.public_token,
    hold_expires_at: holdExpires.toISOString(),
    total: subtotal,
    emailed,
  });
});
