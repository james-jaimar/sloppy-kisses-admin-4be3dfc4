// Creates a real, confirmed booking from the customer portal and issues its invoice
// immediately. All pricing happens server-side through the existing auto-invoice
// triggers, so the client can never dictate an amount.
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const SERVICES = [
  "grooming_inhouse",
  "grooming_mobile",
  "hotel_dog",
  "hotel_cat",
  "pickup_dropoff",
  "daycare",
  "daycare_assessment",
] as const;

const BodySchema = z.object({
  service_type: z.enum(SERVICES),
  pet_ids: z.array(z.string().uuid()).min(1).max(10),
  start_at: z.string().min(1),
  end_at: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  grooming: z
    .object({
      package_id: z.string().uuid().nullable().optional(),
      duration_minutes: z.number().int().min(15).max(600).nullable().optional(),
      instructions: z
        .object({
          selections: z.record(z.any()).default({}),
          medical_flags: z.array(z.string()).default([]),
          notes: z.string().max(2000).nullable().optional(),
        })
        .optional(),
      service_address: z
        .object({ line_1: z.string().max(200), suburb: z.string().max(120) })
        .optional(),
      access_notes: z.string().max(1000).nullable().optional(),
      stay_play: z.boolean().optional(),
      stay_play_collect_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    })
    .optional(),
  hotel: z
    .object({
      accommodation_type: z.string().max(80).nullable().optional(),
      feeding_instructions: z.string().max(2000).nullable().optional(),
      medication_instructions: z.string().max(2000).nullable().optional(),
      belongings_notes: z.string().max(2000).nullable().optional(),
      pickup_required: z.boolean().optional(),
      dropoff_required: z.boolean().optional(),
    })
    .optional(),
  transport: z
    .object({
      direction: z.enum(["pickup", "dropoff", "round_trip"]).default("pickup"),
      pickup_address: z.string().max(300).nullable().optional(),
      dropoff_address: z.string().max(300).nullable().optional(),
      suburb: z.string().max(120).nullable().optional(),
      gate_code: z.string().max(80).nullable().optional(),
    })
    .optional(),
  daycare: z
    .object({
      daycare_plan_id: z.string().uuid(),
      start_date: z.string().min(8),
      selected_days: z.array(z.string().max(12)).max(7).default([]),
    })
    .optional(),
});

type Body = z.infer<typeof BodySchema>;

function serviceGroup(s: Body["service_type"]) {
  if (s.startsWith("grooming")) return "grooming" as const;
  if (s.startsWith("hotel")) return "hotel" as const;
  if (s.startsWith("daycare")) return "daycare" as const;
  return "transport" as const;
}

const SETTINGS_TABLE = {
  grooming: "grooming_workflow_settings",
  hotel: "hotel_workflow_settings",
  transport: "transport_workflow_settings",
  daycare: "daycare_workflow_settings",
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "not_authenticated" }, 401);

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: userRes, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "not_authenticated" }, 401);

  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_request", details: parsed.error.flatten().fieldErrors }, 400);
  const body = parsed.data;

  // --- Who is calling ---------------------------------------------------
  const { data: profile } = await admin
    .from("profiles").select("id").eq("auth_user_id", userRes.user.id).maybeSingle();
  if (!profile) return json({ error: "no_profile" }, 403);

  const { data: customer } = await admin
    .from("customers")
    .select("id, tenant_id, full_name, address_line_1, suburb")
    .eq("linked_profile_id", profile.id)
    .eq("portal_access_enabled", true)
    .maybeSingle();
  if (!customer) return json({ error: "forbidden" }, 403);

  const tenantId = customer.tenant_id as string;
  const group = serviceGroup(body.service_type);

  // --- Pets must belong to this customer --------------------------------
  const { data: pets } = await admin
    .from("pets")
    .select("id, name, species, vax_waived_until")
    .eq("customer_id", customer.id)
    .in("id", body.pet_ids);
  if (!pets || pets.length !== body.pet_ids.length) return json({ error: "invalid_pets" }, 403);

  // --- Daycare is an enrolment, not a single booking ---------------------
  if (body.service_type === "daycare") {
    const d = body.daycare;
    if (!d) return json({ error: "invalid_request" }, 400);
    const rows = body.pet_ids.map((pid) => ({
      tenant_id: tenantId,
      customer_id: customer.id,
      pet_id: pid,
      daycare_plan_id: d.daycare_plan_id,
      start_date: d.start_date,
      selected_days: d.selected_days ?? [],
      notes: body.notes?.trim() || null,
      active: true,
    }));
    const { data: enrolments, error: eErr } = await admin
      .from("daycare_enrolments").insert(rows).select("id, invoice_id");
    if (eErr) return json({ error: eErr.message }, 500);

    // Mid-month enrolments get a standalone issued pro-rata invoice from a DB trigger.
    const enrolmentIds = (enrolments ?? []).map((e: any) => e.id);
    const { data: prorataItems } = await admin
      .from("invoice_items")
      .select("invoice_id")
      .eq("source_type", "daycare_enrolment_prorata")
      .in("source_id", enrolmentIds);

    const invoiceId =
      (prorataItems ?? [])[0]?.invoice_id ??
      enrolments?.find((e: any) => e.invoice_id)?.invoice_id ??
      null;
    let bal = 0;
    if (invoiceId) {
      const { data: inv } = await admin
        .from("invoices").select("balance_due").eq("id", invoiceId).maybeSingle();
      bal = Number(inv?.balance_due ?? 0);

      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-invoice-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ invoice_id: invoiceId, kind: "send" }),
        });
      } catch (e) {
        console.error("portal-create-booking: pro-rata invoice email failed", e);
      }
    }
    return json({
      enrolment_ids: enrolmentIds,
      invoice_id: invoiceId,
      balance_due: bal,
      short_notice: false,
      payment_required_now: false,
    });
  }

  // --- Lead time --------------------------------------------------------
  const start = new Date(body.start_at);
  if (isNaN(start.getTime())) return json({ error: "invalid_start_at" }, 400);

  const settings = group === "daycare"
    ? null
    : (await admin
        .from(SETTINGS_TABLE[group])
        .select("min_lead_hours, require_prepayment_short_notice, vax_gate_mode")
        .eq("tenant_id", tenantId)
        .maybeSingle()).data;

  const minLead = Number((settings as any)?.min_lead_hours ?? 24);
  const requirePrepay = (settings as any)?.require_prepayment_short_notice ?? true;
  const hoursAhead = (start.getTime() - Date.now()) / 3_600_000;
  const shortNotice = hoursAhead < minLead;
  if (hoursAhead < 0) return json({ error: "start_in_past" }, 400);
  if (shortNotice && requirePrepay === false && minLead > 0) {
    return json({ error: "lead_time", min_lead_hours: minLead }, 400);
  }

  // --- Vaccination gate -------------------------------------------------
  const gateMode = (settings as any)?.vax_gate_mode ?? "soft";
  if (gateMode === "hard") {
    const { data: rules } = await admin
      .from("vaccination_rules")
      .select("vaccine_type, species, grace_days, required")
      .eq("tenant_id", tenantId)
      .eq("service_type", body.service_type)
      .eq("required", true);
    if (rules?.length) {
      const { data: vax } = await admin
        .from("vaccinations")
        .select("pet_id, vaccination_type, expiry_date")
        .in("pet_id", body.pet_ids);
      const missing: string[] = [];
      for (const p of pets) {
        // Admin waiver: pet passes the gate while the waiver covers the booking date.
        const waivedUntil = (p as any).vax_waived_until as string | null;
        if (waivedUntil && new Date(waivedUntil + "T23:59:59Z").getTime() >= start.getTime()) continue;
        for (const r of rules) {
          if (r.species !== "any" && r.species !== (p as any).species) continue;
          const rec = (vax ?? []).find(
            (v: any) => v.pet_id === p.id && v.vaccination_type === r.vaccine_type,
          );
          const graceMs = Number(r.grace_days ?? 0) * 86_400_000;
          const ok = rec?.expiry_date && new Date(rec.expiry_date).getTime() + graceMs >= start.getTime();
          if (!ok) missing.push(`${(p as any).name}: ${r.vaccine_type}`);
        }
      }
      if (missing.length) return json({ error: "vaccinations_required", missing }, 400);
    }
  }

  // --- Create the booking ----------------------------------------------
  // --- Hotel capacity gate ---------------------------------------------
  // Portal stays are unassigned, so we compare total pets booked per night
  // against the sum of pens/spaces across all hotel/cattery areas.
  if (group === "hotel" && body.end_at) {
    const { data: hotelSettings } = await admin
      .from("hotel_workflow_settings")
      .select("overbooking_mode")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if ((hotelSettings as any)?.overbooking_mode === "block") {
      const { data: avail } = await admin.rpc("hotel_day_availability", {
        p_tenant_id: tenantId,
        p_start: start.toISOString().slice(0, 10),
        p_end: new Date(body.end_at).toISOString().slice(0, 10),
        p_exclude_booking_id: null,
      });
      const byDay = new Map<string, { used: number; capacity: number; capped: boolean }>();
      for (const r of (avail ?? []) as any[]) {
        const cur = byDay.get(r.day) ?? { used: 0, capacity: 0, capped: false };
        cur.used += Number(r.used ?? 0);
        if (r.capacity != null) { cur.capacity += Number(r.capacity); cur.capped = true; }
        byDay.set(r.day, cur);
      }
      const full = [...byDay.entries()].filter(
        ([, v]) => v.capped && v.used + body.pet_ids.length > v.capacity,
      );
      if (full.length) {
        return json({ error: "no_availability", nights: full.map(([d]) => d) }, 409);
      }
    }
  }

  const { data: numRes, error: numErr } = await admin.rpc("next_booking_number", {
    target_tenant_id: tenantId,
  });
  if (numErr) return json({ error: numErr.message }, 500);

  const endAt = body.end_at
    ? new Date(body.end_at).toISOString()
    : group === "grooming"
      ? new Date(start.getTime() + (body.grooming?.duration_minutes ?? 60) * 60_000).toISOString()
      : null;

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .insert({
      tenant_id: tenantId,
      customer_id: customer.id,
      booking_number: numRes as unknown as string,
      service_type: body.service_type,
      status: "confirmed",
      source: "customer_portal",
      start_at: start.toISOString(),
      end_at: endAt,
      start_date: start.toISOString().slice(0, 10),
      end_date: endAt ? endAt.slice(0, 10) : null,
      notes_customer: body.notes?.trim() || null,
      requires_transport: group === "transport" || Boolean(body.hotel?.pickup_required || body.hotel?.dropoff_required),
    })
    .select("id, booking_number")
    .single();
  if (bErr) return json({ error: bErr.message }, 500);

  const bookingId = booking.id as string;

  const cleanup = async (message: string, status = 500) => {
    await admin.from("bookings").delete().eq("id", bookingId);
    return json({ error: message }, status);
  };

  const { error: bpErr } = await admin.from("booking_pets").insert(
    body.pet_ids.map((pid) => ({ tenant_id: tenantId, booking_id: bookingId, pet_id: pid })),
  );
  if (bpErr) return cleanup(bpErr.message);

  // --- Service details (these triggers do the pricing) ------------------
  if (group === "daycare") {
    // daycare_assessment: a plain booking, priced by staff.
  } else if (group === "grooming") {
    const g = body.grooming ?? {};
    const { error } = await admin.from("grooming_booking_details").insert({
      tenant_id: tenantId,
      booking_id: bookingId,
      grooming_mode: body.service_type === "grooming_inhouse" ? "in_house" : "mobile",
      package_id: g.package_id ?? null,
      duration_minutes: g.duration_minutes ?? 60,
      grooming_notes: g.access_notes ?? null,
    });
    if (error) return cleanup(error.message);

    if (g.instructions) {
      await admin.from("grooming_booking_instructions").insert({
        tenant_id: tenantId,
        booking_id: bookingId,
        selections: g.instructions.selections ?? {},
        medical_flags: g.instructions.medical_flags ?? [],
        notes: g.instructions.notes ?? null,
      });
    }

    // After-groom Stay & Play — billed as an add-on; a DB trigger opens the session.
    if (g.stay_play) {
      const { data: addon } = await admin
        .from("grooming_addons")
        .select("id, name, price_zar")
        .eq("tenant_id", tenantId)
        .eq("code", "stay_play_after")
        .maybeSingle();
      if (addon) {
        await admin.from("grooming_booking_addons").insert({
          tenant_id: tenantId,
          booking_id: bookingId,
          addon_id: addon.id,
          addon_code: "stay_play_after",
          addon_name: addon.name,
          price_zar_snapshot: addon.price_zar,
          qty: 1,
        });
        if (g.stay_play_collect_time) {
          const [hh, mm] = g.stay_play_collect_time.split(":").map(Number);
          const collect = new Date(start);
          collect.setHours(hh, mm, 0, 0);
          await admin
            .from("stay_play_sessions")
            .update({ expected_collect_at: collect.toISOString() })
            .eq("booking_id", bookingId);
        }
      }
    }
  } else if (group === "hotel") {
    const h = body.hotel ?? {};
    const { error } = await admin.from("hotel_booking_details").insert({
      tenant_id: tenantId,
      booking_id: bookingId,
      accommodation_type: h.accommodation_type ?? null,
      feeding_instructions: h.feeding_instructions ?? null,
      medication_instructions: h.medication_instructions ?? null,
      belongings_notes: h.belongings_notes ?? null,
      pickup_required: h.pickup_required ?? false,
      dropoff_required: h.dropoff_required ?? false,
    });
    if (error) return cleanup(error.message);
  } else {
    const t = body.transport ?? { direction: "pickup" as const };
    const { error } = await admin.from("transport_details").insert({
      tenant_id: tenantId,
      booking_id: bookingId,
      direction: t.direction ?? "pickup",
      pickup_address: t.pickup_address ?? customer.address_line_1 ?? null,
      dropoff_address: t.dropoff_address ?? null,
      suburb: t.suburb ?? customer.suburb ?? null,
      gate_code: t.gate_code ?? null,
      planned_window_start: start.toISOString(),
    });
    if (error) return cleanup(error.message);
  }

  // --- Issue the invoice ------------------------------------------------
  const { data: invoiceId, error: invErr } = await admin.rpc("issue_booking_invoice", {
    p_booking_id: bookingId,
  });
  if (invErr) return json({ error: invErr.message, booking_id: bookingId }, 500);

  let balance = 0;
  if (invoiceId) {
    const { data: inv } = await admin
      .from("invoices").select("balance_due").eq("id", invoiceId as string).maybeSingle();
    balance = Number(inv?.balance_due ?? 0);

    // Email the issued invoice to the customer (kill-switch aware inside the function).
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-invoice-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ invoice_id: invoiceId, kind: "send" }),
      });
    } catch (e) {
      console.error("portal-create-booking: invoice email failed", e);
    }
  }

  return json({
    booking_id: bookingId,
    booking_number: booking.booking_number,
    invoice_id: invoiceId ?? null,
    balance_due: balance,
    short_notice: shortNotice,
    payment_required_now: shortNotice && requirePrepay,
  });
});