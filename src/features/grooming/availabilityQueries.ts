import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { BusyInterval, GroomerResource } from "./multiPetSchedule";

export type GroomingPoolKind = "inhouse" | "mobile";

export interface ClosureRow {
  name: string | null;
  start_date: string;
  end_date: string;
  services: string[] | null;
}

export interface DayAvailability {
  pool: number;
  busy: BusyInterval[];
  resources: GroomerResource[];
  closures: ClosureRow[];
}

/**
 * Day availability via a security-definer RPC so both staff and portal customers
 * get the same view. Customers cannot read `bookings`/`resources` directly, and the
 * RPC returns only anonymous busy intervals — no customer or pet details.
 *
 * In-house groomer stations and mobile vans are separate pools: an in-house groom
 * is only measured against the groomer stations, a van job only against the vans.
 */
export function useGroomingDayAvailability(
  tenantId: string | null | undefined,
  date: string | null,
  kind: GroomingPoolKind = "inhouse",
) {
  return useQuery({
    queryKey: ["grooming_day_availability", tenantId, date, kind],
    enabled: Boolean(tenantId && date),
    queryFn: async (): Promise<DayAvailability> => {
      const { data, error } = await supabase.rpc("grooming_day_availability" as any, {
        p_tenant_id: tenantId as string,
        p_day: date as string,
      });
      if (error) throw error;
      const row = (data ?? {}) as any;
      const pool = (row[kind] ?? {}) as any;
      const resources = (pool.resources ?? row.resources ?? []) as GroomerResource[];
      return {
        pool: Math.max(1, Number(pool.pool ?? row.pool ?? 1)),
        busy: (pool.busy ?? row.busy ?? []) as BusyInterval[],
        resources,
        closures: (row.closures ?? []) as ClosureRow[],
      };
    },
  });
}

/** True when the given local date falls inside a closure that covers grooming. */
export function isClosedDay(closures: ClosureRow[] | undefined, dateKey: string) {
  if (!closures?.length) return null;
  const hit = closures.find((c) => {
    if (dateKey < c.start_date || dateKey > c.end_date) return false;
    const svcs = c.services ?? [];
    if (svcs.length === 0) return true;
    return svcs.some((s) => String(s).startsWith("grooming"));
  });
  return hit ?? null;
}
