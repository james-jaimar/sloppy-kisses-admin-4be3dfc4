import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type GroomingVaxGateMode = "soft" | "hard" | "off";

export interface GroomingWorkflowSettings {
  id: string;
  tenant_id: string;
  vax_gate_mode: GroomingVaxGateMode;
  pensioner_discount_pct: number;
  default_mobile_travel_fee_zar: number;
}

export function useGroomingWorkflowSettings(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["grooming_workflow_settings", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<GroomingWorkflowSettings | null> => {
      const { data, error } = await supabase
        .from("grooming_workflow_settings" as any)
        .select("*")
        .eq("tenant_id", tenantId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as GroomingWorkflowSettings | null;
    },
  });
}

export function useUpdateGroomingWorkflowSettings(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<GroomingWorkflowSettings, "id" | "tenant_id">>) => {
      const { error } = await supabase
        .from("grooming_workflow_settings" as any)
        .upsert({ tenant_id: tenantId, ...patch } as any, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grooming_workflow_settings"] }),
  });
}

export interface GroomingVaxRow {
  pet_id: string;
  pet_name: string;
  vaccine_type: string;
  status: "missing" | "no_expiry" | "expired" | "unverified" | "ok";
  expiry_date: string | null;
}

export function useGroomingVaccinationGate(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["grooming_vax_gate", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<GroomingVaxRow[]> => {
      const { data, error } = await supabase.rpc("grooming_can_confirm_booking" as any, { p_booking_id: bookingId });
      if (error) throw error;
      return (data ?? []) as unknown as GroomingVaxRow[];
    },
  });
}

// ---- Grooming booking addons ----
export interface BookingAddonRow {
  id: string;
  booking_id: string;
  addon_id: string;
  addon_code: string | null;
  addon_name: string | null;
  price_zar_snapshot: number;
  qty: number;
}

export function useBookingGroomingAddons(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["grooming_booking_addons", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<BookingAddonRow[]> => {
      const { data, error } = await supabase
        .from("grooming_booking_addons" as any)
        .select("*")
        .eq("booking_id", bookingId as string);
      if (error) throw error;
      return (data ?? []) as unknown as BookingAddonRow[];
    },
  });
}

export function useSetBookingGroomingAddons(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, rows }: {
      bookingId: string;
      rows: { addon_id: string; addon_code: string | null; addon_name: string | null; price_zar_snapshot: number; qty: number }[];
    }) => {
      const del = await supabase.from("grooming_booking_addons" as any).delete().eq("booking_id", bookingId);
      if (del.error) throw del.error;
      if (rows.length > 0) {
        const payload = rows.map((r) => ({ ...r, booking_id: bookingId, tenant_id: tenantId }));
        const ins = await supabase.from("grooming_booking_addons" as any).insert(payload as any);
        if (ins.error) throw ins.error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["grooming_booking_addons", vars.bookingId] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}