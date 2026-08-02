import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface PetVaxWaiver {
  vax_waived_until: string | null;
  vax_waiver_reason: string | null;
  vax_waiver_at: string | null;
}

export function isWaiverActive(until: string | null | undefined) {
  if (!until) return false;
  return until >= new Date().toISOString().slice(0, 10);
}

export function usePetVaxWaiver(petId: string | null | undefined) {
  return useQuery({
    queryKey: ["pet_vax_waiver", petId],
    enabled: Boolean(petId),
    queryFn: async (): Promise<PetVaxWaiver | null> => {
      const { data, error } = await supabase!
        .from("pets")
        .select("vax_waived_until, vax_waiver_reason, vax_waiver_at")
        .eq("id", petId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as PetVaxWaiver | null;
    },
  });
}

export function useSetPetVaxWaiver(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { until: string | null; reason: string | null }) => {
      const { data: prof } = await supabase!.rpc("current_profile_id");
      const { error } = await supabase!
        .from("pets")
        .update({
          vax_waived_until: input.until,
          vax_waiver_reason: input.until ? input.reason : null,
          vax_waiver_by: input.until ? (prof as unknown as string) ?? null : null,
          vax_waiver_at: input.until ? new Date().toISOString() : null,
        } as never)
        .eq("id", petId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pet_vax_waiver", petId] });
      qc.invalidateQueries({ queryKey: ["pets"] });
      qc.invalidateQueries({ queryKey: ["grooming_vax_gate"] });
      qc.invalidateQueries({ queryKey: ["hotel_vax_gate"] });
    },
  });
}
