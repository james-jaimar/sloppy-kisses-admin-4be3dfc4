import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

const sb = supabase as any;

export interface ResourceStaffRow {
  id: string;
  tenant_id: string;
  resource_id: string;
  profile_id: string;
}

/** Every staff ↔ resource assignment for the tenant. */
export function useResourceStaff(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["resource_staff", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<ResourceStaffRow[]> => {
      const { data, error } = await sb
        .from("resource_staff")
        .select("id, tenant_id, resource_id, profile_id")
        .eq("tenant_id", tenantId as string);
      if (error) throw error;
      return (data ?? []) as ResourceStaffRow[];
    },
  });
}

/** Replace the staff assigned to one resource. */
export function useSetResourceStaff(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ resourceId, profileIds }: { resourceId: string; profileIds: string[] }) => {
      const del = await sb.from("resource_staff").delete()
        .eq("tenant_id", tenantId).eq("resource_id", resourceId);
      if (del.error) throw del.error;
      if (profileIds.length) {
        const ins = await sb.from("resource_staff").insert(
          profileIds.map((profile_id) => ({ tenant_id: tenantId, resource_id: resourceId, profile_id })),
        );
        if (ins.error) throw ins.error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resource_staff"] });
      qc.invalidateQueries({ queryKey: ["my_resource_ids"] });
    },
  });
}

/** Replace the resources one staff member works on. */
export function useSetStaffResources(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, resourceIds }: { profileId: string; resourceIds: string[] }) => {
      const del = await sb.from("resource_staff").delete()
        .eq("tenant_id", tenantId).eq("profile_id", profileId);
      if (del.error) throw del.error;
      if (resourceIds.length) {
        const ins = await sb.from("resource_staff").insert(
          resourceIds.map((resource_id) => ({ tenant_id: tenantId, resource_id, profile_id: profileId })),
        );
        if (ins.error) throw ins.error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resource_staff"] });
      qc.invalidateQueries({ queryKey: ["my_resource_ids"] });
    },
  });
}

/** Resource ids the signed-in staff member is assigned to (empty = no restriction). */
export function useMyResourceIds(tenantId: string | null | undefined, profileId: string | null | undefined) {
  return useQuery({
    queryKey: ["my_resource_ids", tenantId, profileId],
    enabled: Boolean(tenantId && profileId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await sb
        .from("resource_staff")
        .select("resource_id")
        .eq("tenant_id", tenantId as string)
        .eq("profile_id", profileId as string);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.resource_id as string);
    },
  });
}
