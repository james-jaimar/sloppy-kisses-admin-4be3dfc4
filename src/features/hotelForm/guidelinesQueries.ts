import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface HotelGuidelines {
  guidelines_md: string;
  guidelines_version: number;
}

/** Hotel guidelines for a tenant — readable by staff and by the tenant's customers. */
export function useHotelGuidelines(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["hotel_guidelines", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<HotelGuidelines | null> => {
      const { data, error } = await supabase.rpc("get_hotel_guidelines", { p_tenant: tenantId! });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as HotelGuidelines) ?? null;
    },
  });
}