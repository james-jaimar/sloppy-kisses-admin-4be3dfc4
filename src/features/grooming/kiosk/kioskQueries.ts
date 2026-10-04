import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface KioskStaff {
  id: string;
  tenant_id: string;
  display_name: string;
  active: boolean;
  has_pin: boolean;
}

export function useKioskStaff(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["grooming_kiosk_staff", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<KioskStaff[]> => {
      const [rows, pins] = await Promise.all([
        supabase
          .from("grooming_kiosk_staff" as any)
          .select("id, tenant_id, display_name, active")
          .eq("tenant_id", tenantId as string)
          .order("display_name"),
        supabase.rpc("grooming_kiosk_has_pin" as any, { p_tenant: tenantId }),
      ]);
      if (rows.error) throw rows.error;
      if (pins.error) throw pins.error;
      const has = new Map(((pins.data ?? []) as any[]).map((r) => [r.id, r.has_pin]));
      return ((rows.data ?? []) as any[]).map((r) => ({ ...r, has_pin: Boolean(has.get(r.id)) }));
    },
  });
}

export function useSaveKioskStaff(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; display_name: string; active: boolean; pin?: string }) => {
      let id = input.id;
      if (id) {
        const { error } = await supabase
          .from("grooming_kiosk_staff" as any)
          .update({ display_name: input.display_name, active: input.active } as any)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("grooming_kiosk_staff" as any)
          .insert({ tenant_id: tenantId, display_name: input.display_name, active: input.active } as any)
          .select("id")
          .single();
        if (error) throw error;
        id = (data as any).id;
      }
      if (input.pin) {
        const { error } = await supabase.rpc("grooming_kiosk_set_pin" as any, { p_staff_id: id, p_pin: input.pin });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grooming_kiosk_staff"] }),
  });
}

export async function kioskAction(params: {
  bookingId: string;
  pin: string;
  action: "start" | "finish";
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("grooming_kiosk_action" as any, {
    p_booking_id: params.bookingId,
    p_pin: params.pin,
    p_action: params.action,
    p_notes: params.notes ?? null,
  });
  if (error) throw error;
  return data as unknown as string;
}

/** Who is grooming each dog today (for the kiosk + TV). */
export function useKioskGroomerNames(bookingIds: string[]) {
  const key = [...bookingIds].sort().join(",");
  return useQuery({
    queryKey: ["grooming_kiosk_names", key],
    enabled: key.length > 0,
    refetchInterval: 30000,
    queryFn: async (): Promise<Record<string, { groomer: string | null; notes: string | null }>> => {
      const { data, error } = await supabase
        .from("grooming_booking_details")
        .select("booking_id, groomer_name, grooming_notes")
        .in("booking_id", key.split(","));
      if (error) throw error;
      const out: Record<string, { groomer: string | null; notes: string | null }> = {};
      for (const r of (data ?? []) as any[]) out[r.booking_id] = { groomer: r.groomer_name, notes: r.grooming_notes };
      return out;
    },
  });
}
