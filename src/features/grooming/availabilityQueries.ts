import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { BusyInterval, GroomerResource } from "./multiPetSchedule";

export interface DayAvailability {
  pool: number;
  busy: BusyInterval[];
  resources: GroomerResource[];
}

/**
 * Day availability via a security-definer RPC so both staff and portal customers
 * get the same view. Customers cannot read `bookings`/`resources` directly, and the
 * RPC returns only anonymous busy intervals — no customer or pet details.
 */
export function useGroomingDayAvailability(tenantId: string | null | undefined, date: string | null) {
  return useQuery({
    queryKey: ["grooming_day_availability", tenantId, date],
    enabled: Boolean(tenantId && date),
    queryFn: async (): Promise<DayAvailability> => {
      const { data, error } = await supabase.rpc("grooming_day_availability" as any, {
        p_tenant_id: tenantId as string,
        p_day: date as string,
      });
      if (error) throw error;
      const row = (data ?? {}) as any;
      return {
        pool: Math.max(1, Number(row.pool ?? 1)),
        busy: (row.busy ?? []) as BusyInterval[],
        resources: (row.resources ?? []) as GroomerResource[],
      };
    },
  });
}