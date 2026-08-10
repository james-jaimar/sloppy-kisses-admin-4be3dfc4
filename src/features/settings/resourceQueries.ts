import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { ResourceType } from "@/features/bookings/queries";

export interface ResourceRow {
  id: string;
  tenant_id: string;
  name: string;
  type: ResourceType;
  description: string | null;
  capacity: number | null;
  active: boolean;
  sort_order: number;
  colour: string | null;
  workday_start: string | null;
  workday_end: string | null;
  created_at: string;
  updated_at: string;
}

export const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: "inhouse_grooming", label: "In-house grooming station" },
  { value: "mobile_van", label: "Mobile grooming van" },
  { value: "transport_vehicle", label: "Pick-up / drop-off vehicle" },
  { value: "daycare_area", label: "Daycare area" },
  { value: "hotel_area", label: "Hotel area / kennel" },
  { value: "cattery_area", label: "Cattery area" },
];

export function useAllResources(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["resources", "all", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<ResourceRow[]> => {
      const { data, error } = await supabase
        .from("resources")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ResourceRow[];
    },
  });
}

export interface ResourceInput {
  name: string;
  type: ResourceType;
  description?: string | null;
  capacity?: number | null;
  active?: boolean;
  sort_order?: number;
  colour?: string | null;
  workday_start?: string | null;
  workday_end?: string | null;
}

/** Groomers only — used by the Groomers settings screen and booking auto-assign. */
export function useGroomers(tenantId: string | null | undefined, opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: ["resources", "groomers", tenantId, opts?.activeOnly ?? false],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<ResourceRow[]> => {
      let q = supabase
        .from("resources")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .eq("type", "inhouse_grooming")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (opts?.activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ResourceRow[];
    },
  });
}

export function useCreateResource(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ResourceInput) => {
      const { data, error } = await supabase
        .from("resources")
        .insert({
          tenant_id: tenantId,
          name: input.name,
          type: input.type as any,
          description: input.description ?? null,
          capacity: input.capacity ?? null,
          active: input.active ?? true,
          sort_order: input.sort_order ?? 100,
          colour: input.colour ?? null,
          workday_start: input.workday_start ?? null,
          workday_end: input.workday_end ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}

export function useUpdateResource(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ResourceInput> }) => {
      const { error } = await supabase
        .from("resources")
        .update(patch as any)
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return { id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}

export function useDeleteResource(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft-delete by deactivating; hard delete would break existing bookings referencing it.
      const { error } = await supabase
        .from("resources")
        .update({ active: false } as any)
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return { id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}