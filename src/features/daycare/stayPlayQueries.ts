import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { isoDate, useDaycareWorkflowSettings } from "./queries";

export type StayPlayStatus = "awaiting" | "in_care" | "collected" | "no_show";
export type StayPlayOrigin = "grooming" | "hotel";

export interface StayPlaySession {
  id: string;
  tenant_id: string;
  booking_id: string | null;
  pet_id: string;
  customer_id: string | null;
  session_date: string;
  origin: StayPlayOrigin;
  status: StayPlayStatus;
  expected_collect_at: string | null;
  collected_at: string | null;
  notes: string | null;
  pet: { id: string; name: string | null; species: string | null; breed: string | null } | null;
  customer: { id: string; full_name: string | null } | null;
  booking: { id: string; booking_number: string | null; service_type: string | null } | null;
}

const SELECT = `
  id, tenant_id, booking_id, pet_id, customer_id, session_date, origin, status,
  expected_collect_at, collected_at, notes,
  pet:pets(id, name, species, breed),
  customer:customers(id, full_name),
  booking:bookings(id, booking_number, service_type)
`;

export function useStayPlayForDay(tenantId: string | null | undefined, day: Date) {
  const dateIso = isoDate(day);
  return useQuery({
    queryKey: ["stay_play_sessions", tenantId, dateIso],
    enabled: Boolean(tenantId),
    refetchInterval: 60000,
    queryFn: async (): Promise<StayPlaySession[]> => {
      const { data, error } = await supabase
        .from("stay_play_sessions")
        .select(SELECT)
        .eq("tenant_id", tenantId as string)
        .eq("session_date", dateIso)
        .order("expected_collect_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

/** Sessions attached to one booking — used for chips on grooming / hotel boards. */
export function useStayPlayForBookings(tenantId: string | null | undefined, bookingIds: string[]) {
  const key = [...bookingIds].sort().join(",");
  return useQuery({
    queryKey: ["stay_play_by_booking", tenantId, key],
    enabled: Boolean(tenantId) && bookingIds.length > 0,
    queryFn: async (): Promise<Record<string, StayPlaySession[]>> => {
      const { data, error } = await supabase
        .from("stay_play_sessions")
        .select(SELECT)
        .eq("tenant_id", tenantId as string)
        .in("booking_id", bookingIds);
      if (error) throw error;
      const out: Record<string, StayPlaySession[]> = {};
      for (const row of (data ?? []) as any[]) {
        if (!row.booking_id) continue;
        (out[row.booking_id] ||= []).push(row);
      }
      return out;
    },
  });
}

export function useUpdateStayPlaySession(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<StayPlaySession> }) => {
      const { error } = await supabase
        .from("stay_play_sessions")
        .update(patch as any)
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stay_play_sessions"] });
      qc.invalidateQueries({ queryKey: ["stay_play_by_booking"] });
    },
  });
}

/**
 * Convenience for any list/board: gives a lookup of booking id -> sessions
 * plus the tenant's configured grace period, ready for <StayPlayBadge />.
 */
export function useStayPlayFlags(tenantId: string | null | undefined, bookingIds: string[]) {
  const q = useStayPlayForBookings(tenantId, bookingIds);
  const settingsQ = useDaycareWorkflowSettings(tenantId);
  const byBooking = q.data ?? {};
  return {
    byBooking,
    graceMinutes: settingsQ.data?.stay_play_grace_minutes ?? 15,
    forBooking: (id: string | null | undefined) => (id ? byBooking[id] : undefined),
  };
}

function _unusedUpdateStayPlaySession(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<StayPlaySession> }) => {
      const { error } = await supabase
        .from("stay_play_sessions")
        .update(patch as any)
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stay_play_sessions"] });
      qc.invalidateQueries({ queryKey: ["stay_play_by_booking"] });
    },
  });
}

/** Minutes past the expected collection time, or null when not overdue. */
export function overdueMinutes(s: StayPlaySession, graceMinutes: number, now = new Date()): number | null {
  if (!s.expected_collect_at) return null;
  if (s.status === "collected") return null;
  const due = new Date(s.expected_collect_at).getTime() + graceMinutes * 60000;
  const diff = Math.floor((now.getTime() - due) / 60000);
  return diff > 0 ? diff : null;
}

export function fmtCollectTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Count of Stay & Play pets on a day — used for daycare capacity maths. */
export async function countStayPlay(tenantId: string, day: Date): Promise<number> {
  const { data, error } = await supabase
    .from("stay_play_sessions")
    .select("pet_id, status")
    .eq("tenant_id", tenantId)
    .eq("session_date", isoDate(day));
  if (error) throw error;
  const pets = new Set<string>();
  for (const r of (data ?? []) as { pet_id: string; status: string }[]) {
    if (r.status === "no_show") continue;
    pets.add(r.pet_id);
  }
  return pets.size;
}