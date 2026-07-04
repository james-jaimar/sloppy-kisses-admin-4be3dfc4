import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Database } from "@/integrations/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type TenantUser = Database["public"]["Tables"]["tenant_users"]["Row"];

export interface TenantMembership {
  tenantUser: TenantUser;
  tenant: Tenant;
}

export interface RoleInfo {
  id: string;
  code: string;
  label: string;
}

interface CurrentUserState {
  profile: Profile | null;
  memberships: TenantMembership[];
  currentTenant: Tenant | null;
  roles: RoleInfo[];
  permissions: string[];
  loading: boolean;
  error: string | null;
}

interface TenantContextValue extends CurrentUserState {
  setCurrentTenantId: (id: string) => void;
  refresh: () => Promise<void>;
  hasPermission: (code: string) => boolean;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

const STORAGE_KEY = "sk.currentTenantId";

export function TenantProvider({ children }: { children: ReactNode }) {
  const { authUser, loading: authLoading } = useAuth();
  const [state, setState] = useState<CurrentUserState>({
    profile: null,
    memberships: [],
    currentTenant: null,
    roles: [],
    permissions: [],
    loading: true,
    error: null,
  });
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  const load = useCallback(async () => {
    if (!authUser) {
      setState({
        profile: null,
        memberships: [],
        currentTenant: null,
        roles: [],
        permissions: [],
        loading: false,
        error: null,
      });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    // 1. Profile
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();

    if (profileErr) {
      setState((s) => ({ ...s, loading: false, error: profileErr.message }));
      return;
    }
    if (!profile) {
      setState({
        profile: null,
        memberships: [],
        currentTenant: null,
        roles: [],
        permissions: [],
        loading: false,
        error: null,
      });
      return;
    }

    // 2. Active tenant memberships (with tenant details)
    const { data: tuRows, error: tuErr } = await supabase
      .from("tenant_users")
      .select("*, tenant:tenants(*)")
      .eq("profile_id", profile.id)
      .eq("status", "active");

    if (tuErr) {
      setState((s) => ({ ...s, profile, loading: false, error: tuErr.message }));
      return;
    }

    const memberships: TenantMembership[] = (tuRows ?? [])
      .filter((r: any) => r.tenant)
      .map((r: any) => ({
        tenantUser: {
          id: r.id,
          tenant_id: r.tenant_id,
          profile_id: r.profile_id,
          status: r.status,
          is_primary_contact: r.is_primary_contact,
          created_at: r.created_at,
          updated_at: r.updated_at,
        } as TenantUser,
        tenant: r.tenant as Tenant,
      }));

    // 3. Pick current tenant
    let current: Tenant | null = null;
    if (memberships.length) {
      const preferred =
        memberships.find((m) => m.tenant.id === selectedTenantId) ??
        memberships.find((m) => m.tenant.slug === "sloppy-kisses") ??
        memberships[0];
      current = preferred.tenant;
    }

    // 4. Roles + permissions for the tenant_user in the current tenant
    let roles: RoleInfo[] = [];
    let permissions: string[] = [];

    if (current) {
      const tenantUserId = memberships.find((m) => m.tenant.id === current!.id)!.tenantUser.id;

      const { data: roleRows, error: rolesErr } = await supabase
        .from("user_roles")
        .select("role:roles(id, code, label)")
        .eq("tenant_user_id", tenantUserId);

      if (rolesErr) {
        setState((s) => ({
          ...s,
          profile,
          memberships,
          currentTenant: current,
          loading: false,
          error: rolesErr.message,
        }));
        return;
      }

      roles = (roleRows ?? [])
        .map((r: any) => r.role)
        .filter(Boolean)
        .map((r: any) => ({ id: r.id, code: r.code, label: r.label }));

      if (roles.length) {
        const { data: permRows, error: permsErr } = await supabase
          .from("role_permissions")
          .select("permission:permissions(code)")
          .in(
            "role_id",
            roles.map((r) => r.id),
          );

        if (permsErr) {
          setState((s) => ({
            ...s,
            profile,
            memberships,
            currentTenant: current,
            roles,
            loading: false,
            error: permsErr.message,
          }));
          return;
        }

        permissions = Array.from(
          new Set(
            (permRows ?? [])
              .map((r: any) => r.permission?.code)
              .filter((c: string | undefined): c is string => Boolean(c)),
          ),
        );
      }
    }

    setState({
      profile,
      memberships,
      currentTenant: current,
      roles,
      permissions,
      loading: false,
      error: null,
    });
  }, [authUser, selectedTenantId]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  const setCurrentTenantId = useCallback((id: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
    setSelectedTenantId(id);
  }, []);

  const isPlatform = state.profile?.user_type === "platform";

  const value = useMemo<TenantContextValue>(
    () => ({
      ...state,
      setCurrentTenantId,
      refresh: load,
      hasPermission: (code: string) => isPlatform || state.permissions.includes(code),
    }),
    [state, setCurrentTenantId, load, isPlatform],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useCurrentUser() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useCurrentUser must be used within TenantProvider");
  return ctx;
}

export function useCurrentTenant() {
  const { currentTenant, memberships, setCurrentTenantId, loading } = useCurrentUser();
  return { tenant: currentTenant, memberships, setCurrentTenantId, loading };
}

export function usePermissions() {
  const { permissions, roles, hasPermission } = useCurrentUser();
  return { permissions, roles, hasPermission };
}

// Convenience re-export for legacy callers
export function useTenant() {
  return useCurrentTenant();
}