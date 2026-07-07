import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type GroomingSpecies = "dog" | "cat" | "rabbit";
export type GroomingSizeBand = "small" | "medium" | "large" | "xl" | "xxl";
export type GroomingPackageType = "full" | "express" | "standard";
export type GroomingAddonKind = "fixed" | "shampoo_upgrade" | "anal" | "teeth" | "nails" | "ears" | "travel";

export interface GroomingPackage {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  species: GroomingSpecies;
  size_band: GroomingSizeBand | null;
  package_type: GroomingPackageType;
  price_zar: number;
  expected_minutes: number;
  active: boolean;
  sort_order: number;
}

export interface GroomingAddon {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  price_zar: number;
  kind: GroomingAddonKind;
  active: boolean;
  sort_order: number;
}

export const SIZE_LABEL: Record<GroomingSizeBand, string> = {
  small: "Small", medium: "Medium", large: "Large", xl: "X-Large", xxl: "XX-Large",
};
export const SPECIES_LABEL: Record<GroomingSpecies, string> = {
  dog: "Dog", cat: "Cat", rabbit: "Rabbit",
};

export function useGroomingPackages(tenantId: string | null | undefined, opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: ["grooming_packages", tenantId, opts?.activeOnly ?? false],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<GroomingPackage[]> => {
      let q = supabase.from("grooming_packages").select("*").eq("tenant_id", tenantId as string)
        .order("sort_order").order("name");
      if (opts?.activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as GroomingPackage[];
    },
  });
}

export function useGroomingAddons(tenantId: string | null | undefined, opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: ["grooming_addons", tenantId, opts?.activeOnly ?? false],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<GroomingAddon[]> => {
      let q = supabase.from("grooming_addons").select("*").eq("tenant_id", tenantId as string)
        .order("sort_order").order("name");
      if (opts?.activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as GroomingAddon[];
    },
  });
}

export function useUpdateGroomingPackage(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<GroomingPackage> }) => {
      const { error } = await supabase.from("grooming_packages").update(patch as any).eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grooming_packages"] }),
  });
}

export function useCreateGroomingPackage(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<GroomingPackage, "id" | "tenant_id">) => {
      const { error } = await supabase.from("grooming_packages").insert({ ...input, tenant_id: tenantId } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grooming_packages"] }),
  });
}

export function useUpdateGroomingAddon(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<GroomingAddon> }) => {
      const { error } = await supabase.from("grooming_addons").update(patch as any).eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grooming_addons"] }),
  });
}

export function useCreateGroomingAddon(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<GroomingAddon, "id" | "tenant_id">) => {
      const { error } = await supabase.from("grooming_addons").insert({ ...input, tenant_id: tenantId } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grooming_addons"] }),
  });
}