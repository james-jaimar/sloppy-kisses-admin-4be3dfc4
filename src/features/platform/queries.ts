import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  timezone: string | null;
  status?: string | null;
}

export interface PlatformProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  user_type: string;
  phone: string | null;
  created_at: string;
  auth_user_id: string | null;
  memberships: { tenant_id: string; tenant_name: string; status: string }[];
}

export interface FlagRow {
  key: string;
  description: string | null;
  enabled: boolean;
  value: unknown;
  updated_at: string;
  updated_by: string | null;
}

export interface AuditRow {
  id: string;
  actor_profile_id: string | null;
  tenant_id: string | null;
  action: string;
  target: string | null;
  payload: unknown;
  created_at: string;
}

export function useAllTenants() {
  return useQuery({
    queryKey: ["platform_tenants"],
    queryFn: async (): Promise<TenantRow[]> => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TenantRow[];
    },
  });
}

export function useAllPlatformProfiles() {
  return useQuery({
    queryKey: ["platform_profiles"],
    queryFn: async (): Promise<PlatformProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          id, email, full_name, user_type, phone, created_at, auth_user_id,
          tenant_users(status, tenant:tenants(id, name))
        `)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        email: r.email,
        full_name: r.full_name,
        user_type: r.user_type,
        phone: r.phone,
        created_at: r.created_at,
        auth_user_id: r.auth_user_id,
        memberships: (r.tenant_users ?? [])
          .filter((t: any) => t.tenant)
          .map((t: any) => ({ tenant_id: t.tenant.id, tenant_name: t.tenant.name, status: t.status })),
      }));
    },
  });
}

export function useSetProfileType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, userType }: { profileId: string; userType: "platform" | "staff" | "customer" }) => {
      const { error } = await supabase.from("profiles").update({ user_type: userType }).eq("id", profileId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform_profiles"] }),
  });
}

export function useFlags() {
  return useQuery({
    queryKey: ["platform_flags"],
    queryFn: async (): Promise<FlagRow[]> => {
      const { data, error } = await supabase
        .from("platform_flags")
        .select("*")
        .order("key", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FlagRow[];
    },
  });
}

export function useUpsertFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { key: string; description?: string | null; enabled: boolean; value?: unknown }) => {
      const { error } = await supabase
        .from("platform_flags")
        .upsert({ key: row.key, description: row.description ?? null, enabled: row.enabled, value: (row.value ?? null) as any });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform_flags"] }),
  });
}

export function useDeleteFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase.from("platform_flags").delete().eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform_flags"] }),
  });
}

export function usePlatformAudit(limit = 200) {
  return useQuery({
    queryKey: ["platform_audit", limit],
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await supabase
        .from("platform_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });
}

export function useNotificationEventsRecent(limit = 100) {
  return useQuery({
    queryKey: ["platform_notification_events", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_events")
        .select("id, tenant_id, event_type, status, created_at, payload")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTableCount(table: string) {
  return useQuery({
    queryKey: ["platform_table_count", table],
    queryFn: async () => {
      const { count, error } = await supabase.from(table as any).select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}
export interface TenantFeatureRow {
  tenant_id: string;
  feature_key: string;
  enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

export function useTenantFeatures(tenantId: string | null) {
  return useQuery({
    queryKey: ["platform_tenant_features", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<TenantFeatureRow[]> => {
      const { data, error } = await supabase
        .from("tenant_features")
        .select("tenant_id, feature_key, enabled, updated_at, updated_by")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data ?? []) as TenantFeatureRow[];
    },
  });
}

export function useSetTenantFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tenantId,
      featureKey,
      enabled,
    }: {
      tenantId: string;
      featureKey: string;
      enabled: boolean;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      let actorProfileId: string | null = null;
      if (auth.user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id")
          .eq("auth_user_id", auth.user.id)
          .maybeSingle();
        actorProfileId = prof?.id ?? null;
      }

      const { error } = await supabase
        .from("tenant_features")
        .upsert(
          { tenant_id: tenantId, feature_key: featureKey, enabled, updated_at: new Date().toISOString(), updated_by: actorProfileId },
          { onConflict: "tenant_id,feature_key" },
        );
      if (error) throw error;

      await supabase.from("platform_audit").insert({
        actor_profile_id: actorProfileId,
        tenant_id: tenantId,
        action: enabled ? "feature.enabled" : "feature.disabled",
        target: featureKey,
        payload: { feature_key: featureKey, enabled },
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["platform_tenant_features", vars.tenantId] });
      qc.invalidateQueries({ queryKey: ["platform_audit"] });
    },
  });
}
