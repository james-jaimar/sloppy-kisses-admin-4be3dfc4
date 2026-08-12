import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface PublicHoliday {
  id: string;
  holiday_date: string;
  name: string;
  blocks_dropoff: boolean;
  blocks_collection: boolean;
}

/** Public holidays configured for the tenant (Settings → Public holidays). */
export function usePublicHolidays(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["public_holidays", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<PublicHoliday[]> => {
      const { data, error } = await supabase
        .from("public_holidays" as any)
        .select("id, holiday_date, name, blocks_dropoff, blocks_collection")
        .eq("tenant_id", tenantId as string)
        .order("holiday_date");
      if (error) throw error;
      return (data ?? []) as unknown as PublicHoliday[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export type MovementKind = "dropoff" | "collection";

/** Dates the gates stay shut no matter what. */
const HARD_CLOSED_MMDD = ["12-25", "12-26", "01-01"];

/**
 * Mirrors the `hotel_movement_block` database function so the UI can explain a
 * blocked arrival/collection day before anything is saved.
 * Returns a reason string when the movement is not allowed, otherwise null.
 */
export function movementBlockReason(
  dateIso: string | null | undefined,
  kind: MovementKind,
  holidays: PublicHoliday[] | undefined,
): string | null {
  if (!dateIso) return null;
  const mmdd = dateIso.slice(5, 10);
  if (HARD_CLOSED_MMDD.includes(mmdd)) {
    return "No collections or drop-offs on 25/26 December or 1 January.";
  }
  const day = new Date(`${dateIso}T00:00:00`).getDay();
  if (kind === "dropoff" && day === 0) {
    return "No check-in on Sundays — arrivals are Monday to Saturday, 09:00–11:00.";
  }
  const h = (holidays ?? []).find((x) => x.holiday_date === dateIso);
  if (h && ((kind === "dropoff" && h.blocks_dropoff) || (kind === "collection" && h.blocks_collection))) {
    return `Closed on this public holiday (${h.name}).`;
  }
  return null;
}

/** Human summary of the arrival/collection rules, shown next to date pickers. */
export const MOVEMENT_RULES_NOTE =
  "Check-in 09:00–11:00, Mon–Sat (no Sundays or public holidays). Collection 09:00–09:30 daily, or 16:00–16:30 with Stay & Play. Gates are closed at other times.";
