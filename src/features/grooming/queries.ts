import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { BookingStatus, ServiceType } from "@/features/bookings/queries";

/**
 * Statuses relevant to the grooming board (in workflow order).
 * Answer from owner: Booked → Checked in → Grooming → Ready.
 * "Booked" bucket includes confirmed/approved/requested; "Checked out" is terminal (not shown as column).
 */
export type GroomingColumn = "booked" | "checked_in" | "grooming" | "ready";

export const GROOMING_COLUMNS: { key: GroomingColumn; label: string; statuses: BookingStatus[]; targetStatus: BookingStatus }[] = [
  { key: "booked",     label: "Booked",     statuses: ["draft","requested","approved","confirmed"], targetStatus: "confirmed" },
  { key: "checked_in", label: "Checked in", statuses: ["checked_in"],                                targetStatus: "checked_in" },
  { key: "grooming",   label: "Grooming",   statuses: ["grooming","in_progress"],                    targetStatus: "grooming" },
  { key: "ready",      label: "Ready",      statuses: ["ready"],                                     targetStatus: "ready" },
];

export function columnForStatus(status: BookingStatus): GroomingColumn | null {
  for (const c of GROOMING_COLUMNS) if (c.statuses.includes(status)) return c.key;
  return null;
}

export interface GroomingBoardCard {
  id: string;
  booking_number: string;
  status: BookingStatus;
  service_type: ServiceType;
  start_at: string | null;
  end_at: string | null;
  resource_id: string | null;
  resource: { id: string; name: string } | null;
  customer: { id: string; full_name: string | null; mobile: string | null } | null;
  pets: { id: string; name: string | null; species: string | null; breed: string | null }[];
  details: {
    package_id: string | null;
    actual_start_at: string | null;
    actual_end_at: string | null;
  } | null;
}

const GROOMING_SERVICE_TYPES: ServiceType[] = ["grooming_inhouse", "grooming_mobile"];

/**
 * All grooming bookings that intersect the given day.
 * We fetch a bit wider then filter client-side to keep the query simple.
 */
export function useGroomingBoardBookings(params: { tenantId: string | null | undefined; day: Date }) {
  const { tenantId, day } = params;
  const dayStr = day.toISOString().slice(0, 10);

  return useQuery({
    queryKey: ["grooming_board", tenantId, dayStr],
    enabled: Boolean(tenantId),
    refetchInterval: 30000,
    queryFn: async (): Promise<GroomingBoardCard[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, booking_number, status, service_type, start_at, end_at, resource_id,
          resource:resources(id, name),
          customer:customers(id, full_name, mobile),
          booking_pets(pet:pets(id, name, species, breed)),
          details:grooming_booking_details(package_id, actual_start_at, actual_end_at)
        `)
        .eq("tenant_id", tenantId as string)
        .in("service_type", GROOMING_SERVICE_TYPES as any)
        .gte("start_date", dayStr)
        .lte("start_date", dayStr)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((b: any) => ({
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
        details: Array.isArray(b.details) ? (b.details[0] ?? null) : (b.details ?? null),
      }));
    },
  });
}

/**
 * Update booking status. On transition into "grooming" we stamp actual_start_at;
 * on transition to "ready" we stamp actual_end_at — so the timer works end-to-end.
 */
export function useUpdateGroomingStatus(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: BookingStatus }) => {
      const { error } = await supabase.from("bookings").update({ status: status as any }).eq("id", bookingId).eq("tenant_id", tenantId);
      if (error) throw error;

      const now = new Date().toISOString();
      if (status === "grooming") {
        await supabase.from("grooming_booking_details").update({ actual_start_at: now } as any).eq("booking_id", bookingId).is("actual_start_at", null);
      } else if (status === "ready") {
        await supabase.from("grooming_booking_details").update({ actual_end_at: now } as any).eq("booking_id", bookingId).is("actual_end_at", null);
      }
      return { bookingId, status };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grooming_board"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export interface VaccinationCheck {
  ok: boolean;
  missing: string[];  // pet names missing vaccinations
  expired: string[];  // pet names with expired vaccinations
}

/**
 * Soft vaccination check across pets in a booking. Non-blocking — used to show a warning at check-in.
 */
export async function checkVaccinations(petIds: string[]): Promise<VaccinationCheck> {
  if (!petIds.length) return { ok: true, missing: [], expired: [] };
  const { data: pets, error: petsErr } = await supabase.from("pets").select("id, name").in("id", petIds);
  if (petsErr) throw petsErr;

  const { data: vaxx, error: vaxxErr } = await supabase.from("vaccinations").select("pet_id, expires_on").in("pet_id", petIds);
  if (vaxxErr) throw vaxxErr;

  const today = new Date().toISOString().slice(0, 10);
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