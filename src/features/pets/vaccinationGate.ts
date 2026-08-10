import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type VaxStatus = "ok" | "waived" | "missing" | "no_expiry" | "expired" | "no_certificate";

export interface VaxGateRow {
  pet_id: string;
  pet_name: string;
  vaccine_type: string;
  label: string;
  status: VaxStatus;
  expiry_date: string | null;
  has_certificate: boolean;
}

export const VAX_STATUS_LABEL: Record<string, string> = {
  ok: "Valid",
  waived: "Waived",
  missing: "Missing",
  no_expiry: "No expiry date",
  expired: "Expired",
  no_certificate: "Awaiting certificate",
};

export function isVaxOutstanding(status: string) {
  return status !== "ok" && status !== "waived";
}

/** Every required vaccination for one booking (all pets on it). */
export function useBookingVaccinationGate(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["booking_vax_gate", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<VaxGateRow[]> => {
      const { data, error } = await supabase.rpc("booking_vaccination_gate" as any, {
        p_booking_id: bookingId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as VaxGateRow[];
    },
  });
}

/** Required vaccinations for one pet, optionally scoped to a service and date. */
export function usePetVaccinationStatus(
  petId: string | null | undefined,
  serviceType?: string | null,
  onDate?: string | null,
) {
  return useQuery({
    queryKey: ["pet_vax_status", petId, serviceType ?? null, onDate ?? null],
    enabled: Boolean(petId),
    queryFn: async (): Promise<VaxGateRow[]> => {
      const { data, error } = await supabase.rpc("pet_vaccination_status" as any, {
        p_pet_id: petId,
        p_service_type: serviceType ?? null,
        p_on: onDate ?? null,
      });
      if (error) throw error;
      return (data ?? []) as unknown as VaxGateRow[];
    },
  });
}

/** Combined status for a set of pets (used before a booking exists). */
export function usePetsVaccinationStatus(
  petIds: string[],
  serviceType?: string | null,
  onDate?: string | null,
) {
  const key = [...petIds].sort().join(",");
  return useQuery({
    queryKey: ["pets_vax_status", key, serviceType ?? null, onDate ?? null],
    enabled: petIds.length > 0,
    queryFn: async (): Promise<VaxGateRow[]> => {
      const results = await Promise.all(
        petIds.map(async (id) => {
          const { data, error } = await supabase.rpc("pet_vaccination_status" as any, {
            p_pet_id: id,
            p_service_type: serviceType ?? null,
            p_on: onDate ?? null,
          });
          if (error) throw error;
          return (data ?? []) as unknown as VaxGateRow[];
        }),
      );
      return results.flat();
    },
  });
}

export interface VaxOutstandingRow {
  customer_id: string;
  pet_id: string;
  pet_name: string;
  outstanding: number;
}

/** Outstanding counts per pet across a tenant, or for one customer. */
export function useVaxOutstanding(tenantId: string | null | undefined, customerId?: string | null) {
  return useQuery({
    queryKey: ["vax_outstanding", tenantId, customerId ?? null],
    enabled: Boolean(tenantId),
    staleTime: 60_000,
    queryFn: async (): Promise<VaxOutstandingRow[]> => {
      const { data, error } = await supabase.rpc("vax_outstanding_by_pet" as any, {
        p_tenant: tenantId,
        p_customer: customerId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as unknown as VaxOutstandingRow[];
    },
  });
}