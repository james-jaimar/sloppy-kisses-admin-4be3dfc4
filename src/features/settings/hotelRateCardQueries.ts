import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type HotelSpecies = "dog" | "cat";
export type PetSizeBand = "xsmall" | "small" | "medium" | "large" | "xlarge" | "xxlarge";
export const SIZE_BAND_ORDER: PetSizeBand[] = ["xsmall", "small", "medium", "large", "xlarge", "xxlarge"];
export const SIZE_BAND_LABEL: Record<PetSizeBand, string> = {
  xsmall: "X-Small", small: "Small", medium: "Medium", large: "Large", xlarge: "X-Large", xxlarge: "XX-Large",
};

export interface HotelRateCard {
  id: string;
  tenant_id: string;
  species: HotelSpecies;
  accommodation_type: string;
  display_name: string;
  nightly_rate_zar: number;
  peak_uplift_pct: number;
  extra_pet_rate_zar: number;
  active: boolean;
  sort_order: number;
  min_size_band: PetSizeBand | null;
  max_size_band: PetSizeBand | null;
}

export interface HotelSurcharge {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  price_zar: number;
  per_night: boolean;
  active: boolean;
  sort_order: number;
}

export interface HotelBookingSurcharge {
  id: string;
  tenant_id: string;
  booking_id: string;
  surcharge_id: string;
  quantity: number;
  price_override_zar: number | null;
}

export const HOTEL_SPECIES_LABEL: Record<HotelSpecies, string> = { dog: "Dog", cat: "Cat" };

/* --------- Rate cards ---------- */
export function useHotelRateCards(tenantId: string | null | undefined, opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: ["hotel_rate_cards", tenantId, opts?.activeOnly ?? false],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<HotelRateCard[]> => {
      let q = supabase.from("hotel_rate_cards" as any).select("*").eq("tenant_id", tenantId as string)
        .order("sort_order").order("display_name");
      if (opts?.activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as HotelRateCard[];
    },
  });
}

export function useCreateHotelRateCard(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Omit<HotelRateCard, "id" | "tenant_id">) => {
      const { error } = await supabase.from("hotel_rate_cards" as any).insert({ ...row, tenant_id: tenantId } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_rate_cards"] }),
  });
}

export function useUpdateHotelRateCard(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<HotelRateCard> }) => {
      const { error } = await supabase.from("hotel_rate_cards" as any).update(patch as any).eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_rate_cards"] }),
  });
}

export function useDeleteHotelRateCard(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hotel_rate_cards" as any).delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_rate_cards"] }),
  });
}

/* --------- Surcharges (catalog) ---------- */
export function useHotelSurcharges(tenantId: string | null | undefined, opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: ["hotel_surcharges", tenantId, opts?.activeOnly ?? false],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<HotelSurcharge[]> => {
      let q = supabase.from("hotel_surcharges" as any).select("*").eq("tenant_id", tenantId as string)
        .order("sort_order").order("name");
      if (opts?.activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as HotelSurcharge[];
    },
  });
}

export function useCreateHotelSurcharge(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Omit<HotelSurcharge, "id" | "tenant_id">) => {
      const { error } = await supabase.from("hotel_surcharges" as any).insert({ ...row, tenant_id: tenantId } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_surcharges"] }),
  });
}

export function useUpdateHotelSurcharge(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<HotelSurcharge> }) => {
      const { error } = await supabase.from("hotel_surcharges" as any).update(patch as any).eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_surcharges"] }),
  });
}

export function useDeleteHotelSurcharge(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hotel_surcharges" as any).delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_surcharges"] }),
  });
}

/* --------- Per-booking surcharge selection ---------- */
export function useBookingHotelSurcharges(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["hotel_booking_surcharges", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<HotelBookingSurcharge[]> => {
      const { data, error } = await supabase.from("hotel_booking_surcharges" as any)
        .select("*").eq("booking_id", bookingId as string);
      if (error) throw error;
      return (data ?? []) as unknown as HotelBookingSurcharge[];
    },
  });
}

export function useSetBookingHotelSurcharges(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, rows }: {
      bookingId: string;
      rows: { surcharge_id: string; quantity: number; price_override_zar?: number | null }[];
    }) => {
      const del = await supabase.from("hotel_booking_surcharges" as any).delete().eq("booking_id", bookingId);
      if (del.error) throw del.error;
      if (rows.length > 0) {
        const payload = rows.map((r) => ({ ...r, booking_id: bookingId, tenant_id: tenantId }));
        const ins = await supabase.from("hotel_booking_surcharges" as any).insert(payload as any);
        if (ins.error) throw ins.error;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["hotel_booking_surcharges", vars.bookingId] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

/* --------- Vaccination gate ---------- */
export interface HotelVaxRow {
  pet_id: string;
  pet_name: string;
  vaccine_type: string;
  status: "missing" | "no_expiry" | "expired" | "unverified" | "waived" | "ok";
  expiry_date: string | null;
}

export function useHotelVaccinationGate(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["hotel_vax_gate", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<HotelVaxRow[]> => {
      const { data, error } = await supabase.rpc("hotel_can_confirm_booking" as any, { p_booking_id: bookingId });
      if (error) throw error;
      return (data ?? []) as unknown as HotelVaxRow[];
    },
  });
}