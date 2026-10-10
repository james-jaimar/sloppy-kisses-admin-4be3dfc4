import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { PetSizeBand } from "@/features/settings/hotelRateCardQueries";

export interface PublicTenant {
  id: string;
  name: string;
  slug: string;
}

/** Resolves the business for the public booking page (by ?tenant= slug, else the sole active tenant). */
export function usePublicTenant(slug?: string | null) {
  return useQuery({
    queryKey: ["public_tenant_info", slug ?? ""],
    queryFn: async (): Promise<PublicTenant | null> => {
      const { data, error } = await supabase.rpc("public_tenant_info" as any, {
        p_slug: slug || null,
      } as any);
      if (error) throw error;
      return (data as PublicTenant | null) ?? null;
    },
  });
}

export interface PublicRate {
  species: "dog" | "cat";
  accommodation_type: string;
  display_name: string;
  nightly_rate_zar: number;
  extra_pet_rate_zar: number;
  peak_uplift_pct: number;
  min_size_band: PetSizeBand | null;
  max_size_band: PetSizeBand | null;
}

export interface PublicSurcharge {
  code: string;
  name: string;
  price_zar: number;
  per_night: boolean;
}

/** Active hotel/cattery rates + add-ons, safe for anonymous visitors. */
export function usePublicHotelRates(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["public_hotel_rates", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<{ rates: PublicRate[]; surcharges: PublicSurcharge[] }> => {
      const { data, error } = await supabase.rpc("public_hotel_rates" as any, {
        p_tenant_id: tenantId as string,
      } as any);
      if (error) throw error;
      const row = (data ?? {}) as any;
      return {
        rates: (row.rates ?? []) as PublicRate[],
        surcharges: (row.surcharges ?? []) as PublicSurcharge[],
      };
    },
  });
}
