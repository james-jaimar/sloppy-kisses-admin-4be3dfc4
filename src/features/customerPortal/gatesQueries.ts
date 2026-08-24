import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface PortalServiceGates {
  hotel_overbooking_mode: "warn" | "block";
  daycare_daily_capacity: number | null;
  transport_overbooking_mode: "warn" | "block";
  transport_max_stops_per_van_per_day: number;
}

/**
 * Capacity / overbooking settings the portal is allowed to see.
 * Customers cannot read the `*_workflow_settings` tables, so a security-definer
 * RPC exposes only these few fields.
 */
export function usePortalServiceGates(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["portal_service_gates", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PortalServiceGates> => {
      const { data, error } = await supabase.rpc("portal_service_gates" as any, {
        p_tenant_id: tenantId as string,
      });
      if (error) throw error;
      const row = (data ?? {}) as any;
      return {
        hotel_overbooking_mode: (row.hotel_overbooking_mode ?? "warn") as "warn" | "block",
        daycare_daily_capacity:
          row.daycare_daily_capacity == null ? null : Number(row.daycare_daily_capacity),
        transport_overbooking_mode: (row.transport_overbooking_mode ?? "warn") as "warn" | "block",
        transport_max_stops_per_van_per_day: Number(row.transport_max_stops_per_van_per_day ?? 12),
      };
    },
  });
}
