import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { ServiceType } from "./queries";

// ---------- Grooming ----------
export interface GroomingDetails {
  id?: string;
  booking_id: string;
  tenant_id: string;
  grooming_mode: "in_house" | "mobile" | null;
  package_id: string | null;
  service_package: string | null;
  groomer_name: string | null;
  duration_minutes: number | null;
  travel_fee: number | null;
  surcharge_amount: number | null;
  matted_surcharge_zar: number | null;
  sedation_surcharge_zar: number | null;
  pensioner_discount: boolean;
  recurring: boolean;
  grooming_notes: string | null;
}

// ---------- Hotel ----------
export interface HotelDetails {
  id?: string;
  booking_id: string;
  tenant_id: string;
  accommodation_type: string | null;
  check_in_window: string | null;
  check_out_window: string | null;
  feeding_instructions: string | null;
  medication_instructions: string | null;
  additional_notes: string | null;
  grooming_required: boolean;
  grooming_instructions: string | null;
  pickup_required: boolean;
  dropoff_required: boolean;
  belongings_notes: string | null;
  emergency_notes: string | null;
}

// ---------- Transport ----------
export interface TransportDetails {
  id?: string;
  booking_id: string;
  tenant_id: string;
  direction: "pickup" | "dropoff" | "round_trip" | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  suburb: string | null;
  gate_code: string | null;
  planned_window_start: string | null;
  planned_window_end: string | null;
  driver_notes: string | null;
}

export type ServiceDetails =
  | { kind: "grooming"; data: GroomingDetails | null }
  | { kind: "hotel"; data: HotelDetails | null }
  | { kind: "transport"; data: TransportDetails | null }
  | { kind: "none"; data: null };

export function serviceKind(t: ServiceType): "grooming" | "hotel" | "transport" | "none" {
  if (t === "grooming_inhouse" || t === "grooming_mobile") return "grooming";
  if (t === "hotel_dog" || t === "hotel_cat") return "hotel";
  if (t === "pickup_dropoff") return "transport";
  return "none";
}

export function useBookingServiceDetails(
  bookingId: string | null | undefined,
  serviceType: ServiceType | null | undefined,
  tenantId: string | null | undefined,
) {
  const kind = serviceType ? serviceKind(serviceType) : "none";
  return useQuery({
    queryKey: ["booking-details", tenantId, bookingId, kind],
    enabled: Boolean(bookingId && tenantId && kind !== "none"),
    queryFn: async (): Promise<ServiceDetails> => {
      if (kind === "grooming") {
        const { data, error } = await supabase
          .from("grooming_booking_details")
          .select("*")
          .eq("booking_id", bookingId as string)
          .eq("tenant_id", tenantId as string)
          .maybeSingle();
        if (error) throw error;
        return { kind, data: (data ?? null) as GroomingDetails | null };
      }
      if (kind === "hotel") {
        const { data, error } = await supabase
          .from("hotel_booking_details")
          .select("*")
          .eq("booking_id", bookingId as string)
          .eq("tenant_id", tenantId as string)
          .maybeSingle();
        if (error) throw error;
        return { kind, data: (data ?? null) as HotelDetails | null };
      }
      if (kind === "transport") {
        const { data, error } = await supabase
          .from("transport_details")
          .select("*")
          .eq("booking_id", bookingId as string)
          .eq("tenant_id", tenantId as string)
          .maybeSingle();
        if (error) throw error;
        return { kind, data: (data ?? null) as TransportDetails | null };
      }
      return { kind: "none", data: null };
    },
  });
}

export function useUpsertBookingDetails(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload:
      | { kind: "grooming"; bookingId: string; data: Partial<GroomingDetails> }
      | { kind: "hotel"; bookingId: string; data: Partial<HotelDetails> }
      | { kind: "transport"; bookingId: string; data: Partial<TransportDetails> }
      | { kind: "none"; bookingId: string; data?: unknown }
    ) => {
      if (payload.kind === "none") return { ok: true };

      const table =
        payload.kind === "grooming"
          ? "grooming_booking_details"
          : payload.kind === "hotel"
            ? "hotel_booking_details"
            : "transport_details";

      // Check if a row exists; upsert manually because there's no unique constraint declared on booking_id.
      const { data: existing, error: exErr } = await supabase
        .from(table as any)
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("booking_id", payload.bookingId)
        .maybeSingle();
      if (exErr) throw exErr;

      if (existing) {
        const { error } = await supabase
          .from(table as any)
          .update(payload.data as any)
          .eq("id", (existing as any).id)
          .eq("tenant_id", tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(table as any)
          .insert({
            tenant_id: tenantId,
            booking_id: payload.bookingId,
            ...(payload.data as any),
          });
        if (error) throw error;
      }
      return { ok: true };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["booking-details", tenantId, vars.bookingId] });
    },
  });
}

// Resource conflict lookup: any other booking on the same resource whose
// [start,end) overlaps [start,end), excluding this booking and cancelled/no_show.
export function useResourceConflicts(params: {
  tenantId: string | null | undefined;
  resourceId: string | null;
  startAt: string | null;
  endAt: string | null;
  excludeBookingId?: string | null;
}) {
  const { tenantId, resourceId, startAt, endAt, excludeBookingId } = params;
  return useQuery({
    queryKey: ["resource-conflicts", tenantId, resourceId, startAt, endAt, excludeBookingId],
    enabled: Boolean(tenantId && resourceId && startAt && endAt),
    queryFn: async () => {
      let q = supabase
        .from("bookings")
        .select("id, booking_number, service_type, start_at, end_at, status")
        .eq("tenant_id", tenantId as string)
        .eq("resource_id", resourceId as string)
        .lt("start_at", endAt as string)
        .gt("end_at", startAt as string)
        .not("status", "in", "(cancelled,no_show)")
        .limit(10);
      if (excludeBookingId) q = q.neq("id", excludeBookingId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}