import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { BookingStatus, ResourceType, ServiceType } from "@/features/bookings/queries";

export const TRANSPORT_SERVICE_TYPES: ServiceType[] = ["pickup_dropoff"];

export type TransportDirection = "pickup" | "dropoff" | "round_trip";

export interface LinkedBookingRow {
  id: string;
  booking_number: string;
  status: BookingStatus;
  service_type: ServiceType;
  start_at: string;
  link_kind: string | null;
  resource: { id: string; name: string } | null;
}

/** Bookings automatically spawned by this one (transport legs, checkout-day grooms). */
export function useLinkedChildBookings(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["linked_child_bookings", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<LinkedBookingRow[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_number, status, service_type, start_at, link_kind, resource:resources(id, name)")
        .eq("parent_booking_id", bookingId as string)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((b: any) => ({ ...b, resource: b.resource ?? null })) as LinkedBookingRow[];
    },
  });
}


export interface TransportVehicle {
  id: string;
  name: string;
  type: ResourceType;
  active: boolean;
  sort_order: number;
  home_suburb: string | null;
}

export interface TransportLeg {
  id: string;
  booking_number: string;
  status: BookingStatus;
  start_at: string;
  end_at: string | null;
  resource_id: string | null;
  resource: { id: string; name: string } | null;
  service_address_id: string | null;
  service_place_id: string | null;
  customer: { id: string; full_name: string | null; mobile: string | null; suburb: string | null; home_address: string | null } | null;
  pets: { id: string; name: string | null; species: string | null; breed: string | null }[];
  details: {
    direction: TransportDirection | null;
    pickup_address: string | null;
    dropoff_address: string | null;
    suburb: string | null;
    driver_notes: string | null;
    gate_code: string | null;
  } | null;
}

export function useTransportVehicles(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["transport_vehicles", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<TransportVehicle[]> => {
      const { data, error } = await supabase
        .from("resources")
        .select("id, name, type, active, sort_order, home_suburb")
        .eq("tenant_id", tenantId as string)
        .eq("type", "transport_vehicle")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TransportVehicle[];
    },
  });
}

export function useTransportLegsForDay(params: { tenantId: string | null | undefined; day: Date }) {
  const { tenantId, day } = params;
  const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const startIso = dayStart.toISOString();
  const endIso = dayEnd.toISOString();
  return useQuery({
    queryKey: ["transport_legs_day", tenantId, startIso],
    enabled: Boolean(tenantId),
    refetchInterval: 30000,
    queryFn: async (): Promise<TransportLeg[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, booking_number, status, start_at, end_at, resource_id,
          service_address_id, service_place_id,
          resource:resources(id, name),
          customer:customers(id, full_name, mobile, suburb, home_address),
          booking_pets(pet:pets(id, name, species, breed)),
          details:transport_details(direction, pickup_address, dropoff_address, suburb, driver_notes, gate_code)
        `)
        .eq("tenant_id", tenantId as string)
        .in("service_type", TRANSPORT_SERVICE_TYPES as any)
        .gte("start_at", startIso)
        .lt("start_at", endIso)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((b: any): TransportLeg => {
        const det = Array.isArray(b.details) ? b.details[0] : b.details;
        return {
          id: b.id,
          booking_number: b.booking_number,
          status: b.status,
          start_at: b.start_at,
          end_at: b.end_at,
          resource_id: b.resource_id,
          resource: b.resource ?? null,
          service_address_id: b.service_address_id ?? null,
          service_place_id: b.service_place_id ?? null,
          customer: b.customer ?? null,
          pets: (b.booking_pets ?? []).map((bp: any) => bp.pet).filter(Boolean),
          details: det ?? null,
        };
      });
    },
  });
}

/** Check if any pickup_dropoff booking exists for the given customer on the given date. */
export function useTransportLegExistsForBooking(params: {
  tenantId: string | null | undefined;
  customerId: string | null | undefined;
  isoDate: string | null; // YYYY-MM-DD
  enabled: boolean;
}) {
  const { tenantId, customerId, isoDate, enabled } = params;
  return useQuery({
    queryKey: ["transport_leg_exists", tenantId, customerId, isoDate],
    enabled: Boolean(enabled && tenantId && customerId && isoDate),
    queryFn: async (): Promise<boolean> => {
      const dayStart = new Date(`${isoDate}T00:00:00`);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
      const { data, error } = await supabase
        .from("bookings")
        .select("id")
        .eq("tenant_id", tenantId as string)
        .eq("customer_id", customerId as string)
        .eq("service_type", "pickup_dropoff")
        .gte("start_at", dayStart.toISOString())
        .lt("start_at", dayEnd.toISOString())
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });
}

export function useAssignLegToVehicle(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, resourceId }: { bookingId: string; resourceId: string | null }) => {
      if (resourceId) {
        const { data: check, error: chkErr } = await supabase.rpc("transport_can_assign_leg" as any, {
          _booking_id: bookingId, _resource_id: resourceId,
        });
        if (chkErr) throw chkErr;
        const c: any = check;
        if (c && c.ok === false) {
          throw new Error(c.reason === "overlap" ? "Overlaps another leg on this vehicle" : "Cannot assign to this vehicle");
        }
      }
      const { error } = await supabase
        .from("bookings")
        .update({ resource_id: resourceId } as any)
        .eq("id", bookingId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport_legs_day"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export function useUpdateTransportStatus(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: BookingStatus }) => {
      const { error } = await supabase
        .from("bookings")
        .update({ status: status as any })
        .eq("id", bookingId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport_legs_day"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

// ---------- Transport workflow settings ----------

export interface TransportWorkflowSettings {
  id: string;
  tenant_id: string;
  min_leg_gap_minutes: number;
  max_leg_gap_minutes: number;
  day_start_time: string;
  day_end_time: string;
  default_pickup_lead_minutes: number;
  default_dropoff_trail_minutes: number;
  default_fee_zar: number;
  round_trip_multiplier: number;
  suburb_fees: Record<string, number> | null;
  photo_gate_mode: "off" | "soft" | "hard";
  base_address: string | null;
  base_place_id: string | null;
  base_latitude: number | null;
  base_longitude: number | null;
  enforce_radius: boolean;
  radius_gate_mode: "warn" | "block";
  gate_code_required_by_time: string | null;
  require_gate_code: boolean;
  overbooking_mode: "warn" | "block";
  max_stops_per_van_per_day: number;
}

export function useTransportWorkflowSettings(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["transport_workflow_settings", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<TransportWorkflowSettings | null> => {
      const { data, error } = await supabase
        .from("transport_workflow_settings")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TransportWorkflowSettings | null;
    },
  });
}

export function useUpdateTransportWorkflowSettings(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<TransportWorkflowSettings, "id" | "tenant_id">>) => {
      const { error } = await supabase
        .from("transport_workflow_settings")
        .upsert({ tenant_id: tenantId, ...patch } as any, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transport_workflow_settings"] }),
  });
}