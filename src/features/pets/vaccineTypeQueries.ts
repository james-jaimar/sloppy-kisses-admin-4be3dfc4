import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface VaccineType {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  species: string;
  default_validity_months: number;
  help_text: string | null;
  active: boolean;
  sort_order: number;
}

export function useVaccineTypes(tenantId: string | null | undefined, opts?: { activeOnly?: boolean; species?: string | null }) {
  return useQuery({
    queryKey: ["vaccine_types", tenantId, opts?.activeOnly ?? false, opts?.species ?? null],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<VaccineType[]> => {
      let q = supabase.from("vaccine_types" as any).select("*").eq("tenant_id", tenantId as string)
        .order("sort_order").order("name");
      if (opts?.activeOnly) q = q.eq("active", true);
      if (opts?.species) q = q.eq("species", opts.species);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as VaccineType[];
    },
  });
}

export function useUpsertVaccineType(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<VaccineType> & { name: string }) => {
      const code = (row.code || row.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const payload: any = { ...row, code, tenant_id: tenantId };
      const { error } = row.id
        ? await supabase.from("vaccine_types" as any).update(payload).eq("id", row.id).eq("tenant_id", tenantId)
        : await supabase.from("vaccine_types" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vaccine_types"] }),
  });
}

export function useDeleteVaccineType(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vaccine_types" as any).delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vaccine_types"] }),
  });
}
