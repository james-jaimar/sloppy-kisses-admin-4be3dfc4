import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Database } from "@/integrations/supabase/types";
import { featureDefault, isSellable } from "@/lib/features/catalog";

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
  features: Record<string, boolean>;
  loading: boolean;
  error: string | null;
}

interface TenantContextValue extends CurrentUserState {
  setCurrentTenantId: (id: string) => void;
  refresh: () => Promise<void>;
  hasPermission: (code: string) => boolean;
  hasFeature: (key: string) => boolean;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

const STORAGE_KEY = "sk.currentTenantId";
const CACHE_KEY = "sk.currentUserCache.v3";

type CachedState = Omit<CurrentUserState, "loading" | "error"> & { authUserId: string };

function readCache(): CachedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedState;
  } catch {
    return null;
  }
}

function writeCache(authUserId: string, s: CurrentUserState) {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedState = {
      authUserId,
      profile: s.profile,
      memberships: s.memberships,
      currentTenant: s.currentTenant,
      roles: s.roles,
      permissions: s.permissions,
      features: s.features,
    };
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

function clearCache() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { authUser, loading: authLoading } = useAuth();
  const [state, setState] = useState<CurrentUserState>(() => {
    const cached = readCache();
    if (cached) {
      return {
        profile: cached.profile,
        memberships: cached.memberships,
        currentTenant: cached.currentTenant,
        roles: cached.roles,
        permissions: cached.permissions,
        features: cached.features ?? {},
        loading: false,
        error: null,
      };
    }
    return {
      profile: null,
      memberships: [],
      currentTenant: null,
      roles: [],
      permissions: [],
      features: {},
      loading: true,
      error: null,
    };
  });
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });
  const loadedForUserRef = useRef<string | null>(readCache()?.authUserId ?? null);
  const inflightRef = useRef(false);

  const load = useCallback(async () => {
    if (!authUser) {
      loadedForUserRef.current = null;
      clearCache();
      setState({
        profile: null,
        memberships: [],
        currentTenant: null,
        roles: [],
        permissions: [],
        features: {},
        loading: false,
        error: null,
      });
      return;
    }

    if (inflightRef.current) return;
    inflightRef.current = true;

    // Only show the blocking loading state on the very first load for this
    // user. Subsequent reloads (e.g. after a token refresh on tab focus)
    // refresh state silently in the background so the UI doesn't flash.
    const isFirstLoad = loadedForUserRef.current !== authUser.id;
    setState((s) => (isFirstLoad ? { ...s, loading: true, error: null } : { ...s, error: null }));

    // 1. Profile
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();

    if (profileErr) {
      inflightRef.current = false;
      setState((s) => ({ ...s, loading: false, error: profileErr.message }));
      return;
    }
    if (!profile) {
      inflightRef.current = false;
      setState({
        profile: null,
        memberships: [],
        currentTenant: null,
        roles: [],
        permissions: [],
        features: {},
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
      inflightRef.current = false;
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
    let features: Record<string, boolean> = {};

    if (current) {
      const tenantUserId = memberships.find((m) => m.tenant.id === current!.id)!.tenantUser.id;

      const { data: featureRows } = await supabase
        .from("tenant_features")
        .select("feature_key, enabled")
        .eq("tenant_id", current.id);
      features = Object.fromEntries(
        (featureRows ?? []).map((r: any) => [r.feature_key as string, Boolean(r.enabled)]),
      );

      const { data: roleRows, error: rolesErr } = await supabase
        .from("user_roles")
        .select("role:roles(id, code, label)")
        .eq("tenant_user_id", tenantUserId);

      if (rolesErr) {
        inflightRef.current = false;
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
          inflightRef.current = false;
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

    loadedForUserRef.current = authUser.id;
    inflightRef.current = false;
    const next: CurrentUserState = {
      profile,
      memberships,
      currentTenant: current,
      roles,
      permissions,
      features,
      loading: false,
      error: null,
    };
    setState(next);
    writeCache(authUser.id, next);
  }, [authUser, selectedTenantId]);

  useEffect(() => {
    if (authLoading) return;
    load();
    // Re-run only when the signed-in user id or the selected tenant changes,
    // not on every new session object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authUser?.id, selectedTenantId]);

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
      hasFeature: (key: string) => {
        if (!isSellable(key)) return true;
        if (isPlatform) return true;
        const explicit = state.features[key];
        return explicit === undefined ? featureDefault(key) : explicit;
      },
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