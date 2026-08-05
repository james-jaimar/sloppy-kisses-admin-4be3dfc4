import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type HotelGroomStatus = "pending" | "scheduled" | "declined" | "cancelled";

export interface HotelGroomRequest {
  id: string;
  tenant_id: string;
  hotel_booking_id: string;
  pet_id: string | null;
  customer_id: string | null;
  pet_name: string | null;
  window_start: string | null;
  window_end: string | null;
  customer_notes: string | null;
  status: HotelGroomStatus;
  grooming_booking_id: string | null;
  scheduled_at: string | null;
  decline_reason: string | null;
  created_at: string;
}

const SELECT = "*";

/** Requests attached to one hotel booking. */
export function useBookingGroomRequests(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["hotel_groom_requests", "booking", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<HotelGroomRequest[]> => {
      const { data, error } = await supabase!
        .from("hotel_grooming_requests" as any)
        .select(SELECT)
        .eq("hotel_booking_id", bookingId as string)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as any as HotelGroomRequest[];
    },
  });
}

export interface HotelGroomQueueRow extends HotelGroomRequest {
  hotel_booking: { booking_number: string | null } | null;
  pet: { id: string; name: string | null } | null;
  customer: { id: string; first_name: string | null; last_name: string | null } | null;
}

/** Tenant-wide queue of grooms still to be slotted into a stay. */
export function useHotelGroomQueue(
  tenantId: string | null | undefined,
  opts?: { status?: HotelGroomStatus[] },
) {
  const statuses = opts?.status ?? ["pending"];
  return useQuery({
    queryKey: ["hotel_groom_requests", "queue", tenantId, statuses.join(",")],
    enabled: Boolean(tenantId),
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<HotelGroomQueueRow[]> => {
      const { data, error } = await supabase!
        .from("hotel_grooming_requests" as any)
        .select(
          "*, hotel_booking:bookings!hotel_grooming_requests_hotel_booking_id_fkey(booking_number), pet:pets(id, name), customer:customers(id, first_name, last_name)",
        )
        .eq("tenant_id", tenantId as string)
        .in("status", statuses)
        .order("window_start", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any as HotelGroomQueueRow[];
    },
  });
}

/** Count of grooms awaiting scheduling — for badges/tiles. */
export function useHotelGroomPendingCount(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["hotel_groom_requests", "pending_count", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase!
        .from("hotel_grooming_requests" as any)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId as string)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useScheduleHotelGroom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      requestId: string;
      startAt: string;
      endAt: string;
      packageId?: string | null;
      resourceId?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase!.rpc("schedule_hotel_groom" as any, {
        p_request_id: input.requestId,
        p_start_at: input.startAt,
        p_end_at: input.endAt,
        p_package_id: input.packageId ?? null,
        p_resource_id: input.resourceId ?? null,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotel_groom_requests"] });
      qc.invalidateQueries({ queryKey: ["grooming_board"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export function useDeclineHotelGroom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; reason: string }) => {
      const { error } = await supabase!.rpc("decline_hotel_groom" as any, {
        p_request_id: input.requestId,
        p_reason: input.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_groom_requests"] }),
  });
}
