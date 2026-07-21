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

export interface VaxCheck { ok: boolean; missing: string[]; expired: string[]; }

export async function checkVaccinations(petIds: string[]): Promise<VaxCheck> {
  if (!petIds.length) return { ok: true, missing: [], expired: [] };
  const [{ data: pets, error: pErr }, { data: vaxx, error: vErr }] = await Promise.all([
    supabase.from("pets").select("id, name").in("id", petIds),
    supabase.from("vaccinations").select("pet_id, expires_on").in("pet_id", petIds),
  ]);
  if (pErr) throw pErr;
  if (vErr) throw vErr;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const byPet = new Map<string, { expires_on: string | null }[]>();
  for (const v of vaxx ?? []) {
    const arr = byPet.get((v as any).pet_id) ?? [];
    arr.push({ expires_on: (v as any).expires_on });
    byPet.set((v as any).pet_id, arr);
  }
  const missing: string[] = [];
  const expired: string[] = [];
  for (const p of pets ?? []) {
    const list = byPet.get((p as any).id) ?? [];
    if (!list.length) { missing.push((p as any).name ?? "Unnamed pet"); continue; }
    const hasValid = list.some((v) => !v.expires_on || v.expires_on >= today);
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

export interface HotelWorkflowSettings {
  id: string;
  tenant_id: string;
  vax_gate_mode: VaxGateMode;
  check_in_open_time: string;   // "HH:MM:SS"
  check_in_close_time: string;
  check_out_by_time: string;
  late_checkout_fee_zar: number;
  peak_start_month_day: string | null;  // 'MM-DD'
  peak_end_month_day: string | null;
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