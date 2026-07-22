import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { BookingStatus, ResourceType, ServiceType } from "@/features/bookings/queries";

export const MOBILE_SERVICE_TYPES: ServiceType[] = ["grooming_mobile"];

export interface MobileVanResource {
  id: string;
  name: string;
  type: ResourceType;
  active: boolean;
  sort_order: number;
  home_suburb: string | null;
}

export interface VanStop {
  id: string;
  booking_number: string;
  status: BookingStatus;
  service_type: ServiceType;
  start_at: string;
  end_at: string | null;
  resource_id: string | null;
  resource: { id: string; name: string } | null;
  customer: { id: string; full_name: string | null; mobile: string | null; suburb: string | null } | null;
  pets: { id: string; name: string | null; species: string | null; breed: string | null }[];
  package: { id: string; name: string; expected_minutes: number | null } | null;
}

export function useMobileVans(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["mobile_vans", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<MobileVanResource[]> => {
      const { data, error } = await supabase
        .from("resources")
        .select("id, name, type, active, sort_order, home_suburb")
        .eq("tenant_id", tenantId as string)
        .eq("type", "mobile_van")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MobileVanResource[];
    },
  });
}

/** Mobile grooming bookings for a single local day. */
export function useMobileBookingsForDay(params: { tenantId: string | null | undefined; day: Date }) {
  const { tenantId, day } = params;
  const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const startIso = dayStart.toISOString();
  const endIso = dayEnd.toISOString();
  return useQuery({
    queryKey: ["mobile_bookings_day", tenantId, startIso],
    enabled: Boolean(tenantId),
    refetchInterval: 30000,
    queryFn: async (): Promise<VanStop[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, booking_number, status, service_type, start_at, end_at, resource_id,
          resource:resources(id, name),
          customer:customers(id, full_name, mobile, suburb),
          booking_pets(pet:pets(id, name, species, breed)),
          details:grooming_booking_details(package:grooming_packages(id, name, expected_minutes))
        `)
        .eq("tenant_id", tenantId as string)
        .in("service_type", MOBILE_SERVICE_TYPES as any)
        .gte("start_at", startIso)
        .lt("start_at", endIso)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((b: any): VanStop => {
        const det = Array.isArray(b.details) ? b.details[0] : b.details;
        return {
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
          package: det?.package ?? null,
        };
      });
    },
  });
}

export function useAssignBookingToVan(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, resourceId }: { bookingId: string; resourceId: string | null }) => {
      if (resourceId) {
        const { data: check, error: chkErr } = await supabase.rpc("van_can_assign_stop" as any, {
          _booking_id: bookingId, _resource_id: resourceId,
        });
        if (chkErr) throw chkErr;
        const c: any = check;
        if (c && c.ok === false) {
          throw new Error(c.reason === "overlap" ? "Overlaps another stop on this van" : "Cannot assign to this van");
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
      qc.invalidateQueries({ queryKey: ["mobile_bookings_day"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export function useUpdateVanBookingStatus(tenantId: string) {
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
      qc.invalidateQueries({ queryKey: ["mobile_bookings_day"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

// ---------- Van workflow settings ----------

export interface VanWorkflowSettings {
  id: string;
  tenant_id: string;
  min_travel_gap_minutes: number;
  max_travel_gap_minutes: number;
  day_start_time: string; // "HH:MM:SS"
  day_end_time: string;
}

export function useVanWorkflowSettings(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["van_workflow_settings", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<VanWorkflowSettings | null> => {
      const { data, error } = await supabase
        .from("van_workflow_settings")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as VanWorkflowSettings | null;
    },
  });
}

export function useUpdateVanWorkflowSettings(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<VanWorkflowSettings, "id" | "tenant_id">>) => {
      const { error } = await supabase
        .from("van_workflow_settings")
        .upsert({ tenant_id: tenantId, ...patch } as any, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["van_workflow_settings"] }),
  });
}

export function useUpdateVanHomeSuburb(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ resourceId, homeSuburb }: { resourceId: string; homeSuburb: string | null }) => {
      const { error } = await supabase
        .from("resources")
        .update({ home_suburb: homeSuburb } as any)
        .eq("id", resourceId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mobile_vans"] });
      qc.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}