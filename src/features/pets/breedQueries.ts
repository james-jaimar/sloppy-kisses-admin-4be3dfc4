import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type PetSize = "xsmall" | "small" | "medium" | "large" | "xlarge" | "xxlarge";
// Breeds catalog stores the five bands used on the SK website:
export type BreedSizeBand = "small" | "medium" | "large" | "xlarge" | "xxlarge";

export interface DogBreed {
  id: string;
  name: string;
  size_band: BreedSizeBand;
  active: boolean;
  sort_order: number;
}

export const BREED_SIZE_LABEL: Record<BreedSizeBand, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  xlarge: "X-Large",
  xxlarge: "XX-Large",
};

export function useDogBreeds(opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? true;
  return useQuery({
    queryKey: ["dog_breeds", activeOnly],
    queryFn: async (): Promise<DogBreed[]> => {
      let q = supabase.from("dog_breeds").select("*").order("name");
      if (activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DogBreed[];
    },
  });
}

export function useCreateDogBreed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<DogBreed, "id">) => {
      const { error } = await supabase.from("dog_breeds").insert(input as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dog_breeds"] }),
  });
}

export function useUpdateDogBreed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<DogBreed> }) => {
      const { error } = await supabase.from("dog_breeds").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dog_breeds"] }),
  });
}

export function useDeleteDogBreed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dog_breeds").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dog_breeds"] }),
  });
}