import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { BookingStatus, ServiceType, ResourceType } from "@/features/bookings/queries";

export const HOTEL_SERVICE_TYPES: ServiceType[] = ["hotel_dog", "hotel_cat"];
export const HOTEL_RESOURCE_TYPES: ResourceType[] = ["hotel_area", "cattery_area"];

export interface HotelBookingRow {
  id: string;
  booking_number: string;
  status: BookingStatus;
  service_type: ServiceType;
  start_at: string;
  end_at: string | null;
  resource_id: string | null;
  resource: { id: string; name: string; type: ResourceType } | null;
  customer: { id: string; full_name: string | null; mobile: string | null } | null;
  pets: { id: string; name: string | null; species: string | null; breed: string | null }[];
}

export interface HotelResourceRow {
  id: string;
  name: string;
  type: ResourceType;
  capacity: number | null;
  sort_order: number;
}

/** Resources for hotel/cattery, active only. */
export function useHotelResources(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["hotel_resources", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<HotelResourceRow[]> => {
      const { data, error } = await supabase
        .from("resources")
        .select("id, name, type, capacity, sort_order")
        .eq("tenant_id", tenantId as string)
        .in("type", HOTEL_RESOURCE_TYPES as any)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HotelResourceRow[];
    },
  });
}

/**
 * Hotel/cattery bookings overlapping the given [windowStart, windowEnd) range.
 * Overlap = booking.start_at < windowEnd AND booking.end_at > windowStart (or end_at null).
 * We fetch conservatively (start_at < windowEnd) and filter end_at client-side to allow null end_at.
 */
export function useHotelBookingsInWindow(params: {
  tenantId: string | null | undefined;
  windowStart: Date;
  windowEnd: Date;
}) {
  const { tenantId, windowStart, windowEnd } = params;
  const startIso = windowStart.toISOString();
  const endIso = windowEnd.toISOString();
  return useQuery({
    queryKey: ["hotel_bookings", tenantId, startIso, endIso],
    enabled: Boolean(tenantId),
    refetchInterval: 30000,
    queryFn: async (): Promise<HotelBookingRow[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, booking_number, status, service_type, start_at, end_at, resource_id,
          resource:resources(id, name, type),
          customer:customers(id, full_name, mobile),
          booking_pets(pet:pets(id, name, species, breed))
        `)
        .eq("tenant_id", tenantId as string)
        .in("service_type", HOTEL_SERVICE_TYPES as any)
        .lt("start_at", endIso)
        .order("start_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      const startMs = windowStart.getTime();
      return (data ?? [])
        .map((b: any): HotelBookingRow => ({
          id: b.id,
          booking_number: b.booking_number,
          status: b.status,
          service_type: b.service_type,
          start_at: b.start_at,
          end_at: b.end_at,
          resource_id: b.resource_id,
          resource: b.resource ?? null,
          customer: b.customer ?? null,
          pets: (b.booking_pets ?? []).map((bp: any) => bp.pet).filter(Boolean),
        }))
        .filter((b) => {
          if (!b.end_at) return true; // open-ended treated as ongoing
          return new Date(b.end_at).getTime() > startMs;
        });
    },
  });
}

export interface HotelQuoteRow {
  id: string;
  estimate_number: string;
  status: string;
  service_type: ServiceType;
  start_at: string;
  end_at: string | null;
  hold_expires_at: string | null;
  total: number | null;
  customer: { id: string; full_name: string | null } | null;
  petNames: string[];
}

/** Open hotel/cattery quotes (draft or sent) whose dates overlap the board window. */
export function useHotelQuotesInWindow(params: {
  tenantId: string | null | undefined;
  windowStart: Date;
  windowEnd: Date;
}) {
  const { tenantId, windowStart, windowEnd } = params;
  const startIso = windowStart.toISOString();
  const endIso = windowEnd.toISOString();
  return useQuery({
    queryKey: ["hotel_quotes", tenantId, startIso, endIso],
    enabled: Boolean(tenantId),
    refetchInterval: 60000,
    queryFn: async (): Promise<HotelQuoteRow[]> => {
      const { data, error } = await supabase
        .from("estimates")
        .select(
          "id, estimate_number, status, service_type, start_at, end_at, hold_expires_at, total, pet_ids, customer:customers(id, full_name)",
        )
        .eq("tenant_id", tenantId as string)
        .in("service_type", HOTEL_SERVICE_TYPES as any)
        .in("status", ["draft", "sent"] as any)
        .not("start_at", "is", null)
        .lt("start_at", endIso)
        .order("start_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      const startMs = windowStart.getTime();
      const rows = (data ?? []).filter((q: any) => {
        if (!q.end_at) return true;
        return new Date(q.end_at).getTime() > startMs;
      });

      // Resolve pet names in one lookup.
      const petIds = Array.from(new Set(rows.flatMap((q: any) => (q.pet_ids ?? []) as string[])));
      const nameById = new Map<string, string>();
      if (petIds.length) {
        const { data: pets } = await supabase.from("pets").select("id, name").in("id", petIds);
        for (const p of pets ?? []) nameById.set((p as any).id, (p as any).name ?? "Unnamed pet");
      }

      return rows.map((q: any): HotelQuoteRow => ({
        id: q.id,
        estimate_number: q.estimate_number,
        status: q.status,
        service_type: q.service_type,
        start_at: q.start_at,
        end_at: q.end_at,
        hold_expires_at: q.hold_expires_at ?? null,
        total: q.total == null ? null : Number(q.total),
        customer: q.customer ?? null,
        petNames: ((q.pet_ids ?? []) as string[]).map((id) => nameById.get(id) ?? "Pet"),
      }));
    },
  });
}



export function useUpdateBookingStatus(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: BookingStatus }) => {
      const { error } = await supabase
        .from("bookings")
        .update({ status: status as any })
        .eq("id", bookingId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return { bookingId, status };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotel_bookings"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

/** Assign (or clear) the hotel/cattery area on a booking straight from the board. */
export function useAssignBookingResource(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, resourceId }: { bookingId: string; resourceId: string | null }) => {
      const { error } = await supabase
        .from("bookings")
        .update({ resource_id: resourceId })
        .eq("id", bookingId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return { bookingId, resourceId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotel_bookings"] });
      qc.invalidateQueries({ queryKey: ["hotel_day_availability"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export interface VaxCheck { ok: boolean; missing: string[]; expired: string[]; }

export async function checkVaccinations(petIds: string[]): Promise<VaxCheck> {
  if (!petIds.length) return { ok: true, missing: [], expired: [] };
  const [{ data: pets, error: pErr }, { data: vaxx, error: vErr }] = await Promise.all([
    supabase.from("pets").select("id, name, vax_waived_until").in("id", petIds),
    supabase.from("vaccinations").select("pet_id, expiry_date").in("pet_id", petIds),
  ]);
  if (pErr) throw pErr;
  if (vErr) throw vErr;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const byPet = new Map<string, (string | null)[]>();
  for (const v of vaxx ?? []) {
    const arr = byPet.get((v as any).pet_id) ?? [];
    arr.push((v as any).expiry_date);
    byPet.set((v as any).pet_id, arr);
  }
  const missing: string[] = [];
  const expired: string[] = [];
  for (const p of pets ?? []) {
    const waived = (p as any).vax_waived_until && (p as any).vax_waived_until >= today;
    if (waived) continue;
    const list = byPet.get((p as any).id) ?? [];
    if (!list.length) { missing.push((p as any).name ?? "Unnamed pet"); continue; }
    const hasValid = list.some((d) => !d || d >= today);
    if (!hasValid) expired.push((p as any).name ?? "Unnamed pet");
  }
  return { ok: !missing.length && !expired.length, missing, expired };
}

export async function logVaccinationOverride(params: { tenantId: string; bookingId: string; note: string }) {
  const { error } = await supabase.from("booking_status_events").insert({
    tenant_id: params.tenantId,
    booking_id: params.bookingId,
    to_status: "checked_in" as any,
    event_kind: "vaccination_override",
    note: params.note,
  } as any);
  if (error) throw error;
}

// ---------- Hotel workflow settings ----------

export type VaxGateMode = "soft" | "hard" | "off";
export type OverbookingMode = "warn" | "block";

export interface HotelWorkflowSettings {
  id: string;
  tenant_id: string;
  vax_gate_mode: VaxGateMode;
  photo_gate_mode: "off" | "soft" | "hard";
  overbooking_mode: OverbookingMode;
  check_in_open_time: string;   // "HH:MM:SS"
  check_in_close_time: string;
  check_out_by_time: string;
  late_checkout_fee_zar: number;
  peak_start_month_day: string | null;  // 'MM-DD'
  peak_end_month_day: string | null;
  deposit_split_enabled: boolean;
  checkout_groom_discount_pct: number;
  daycare_credit_enabled: boolean;
  guidelines_md: string | null;
  guidelines_version: number;
}

export function useHotelWorkflowSettings(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["hotel_workflow_settings", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<HotelWorkflowSettings | null> => {
      const { data, error } = await supabase
        .from("hotel_workflow_settings")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as HotelWorkflowSettings | null;
    },
  });
}

export function useUpdateHotelWorkflowSettings(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<HotelWorkflowSettings, "id" | "tenant_id">>) => {
      // Upsert on unique (tenant_id)
      const { error } = await supabase
        .from("hotel_workflow_settings")
        .upsert({ tenant_id: tenantId, ...patch } as any, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_workflow_settings"] }),
  });
}

// ---------- Occupancy / availability ----------

export interface DayAvailabilityRow {
  resource_id: string;
  resource_name: string;
  capacity: number | null;
  day: string;   // 'YYYY-MM-DD'
  used: number;
}

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Per-resource, per-night occupancy (pets, not bookings) for [start, end).
 * Backed by the tenant-scoped `hotel_day_availability` RPC so both the board
 * and the booking forms agree on what "full" means.
 */
export function useHotelDayAvailability(params: {
  tenantId: string | null | undefined;
  start: Date | null;
  end: Date | null;
  excludeBookingId?: string | null;
  enabled?: boolean;
}) {
  const { tenantId, start, end, excludeBookingId = null, enabled = true } = params;
  const s = start ? isoDate(start) : null;
  const e = end ? isoDate(end) : null;
  return useQuery({
    queryKey: ["hotel_day_availability", tenantId, s, e, excludeBookingId],
    enabled: Boolean(tenantId && s && e && enabled),
    queryFn: async (): Promise<DayAvailabilityRow[]> => {
      const { data, error } = await supabase.rpc("hotel_day_availability" as any, {
        p_tenant_id: tenantId as string,
        p_start: s as string,
        p_end: e as string,
        p_exclude_booking_id: excludeBookingId,
      } as any);
      if (error) throw error;
      return (data ?? []) as DayAvailabilityRow[];
    },
  });
}