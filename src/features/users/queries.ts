import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface TenantUserRow {
  id: string;                     // tenant_users.id
  tenant_id: string;
  profile_id: string;
  status: string;
  is_primary_contact: boolean;
  created_at: string;
  profile: {
    id: string;
    full_name: string | null;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    auth_user_id: string | null;
    user_type: string;
  };
  roles: { id: string; code: string; label: string }[];
}

export interface RoleRow {
  id: string;
  code: string;
  label: string;
  description: string | null;
  is_system_role: boolean;
}

export interface PermissionRow {
  id: string;
  code: string;
  label: string;
  description: string | null;
}

/** All staff members for the current tenant, with their profile + roles. */
export function useTenantMembers(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["tenant_members", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<TenantUserRow[]> => {
      const { data, error } = await supabase
        .from("tenant_users")
        .select(`
          id, tenant_id, profile_id, status, is_primary_contact, created_at,
          profile:profiles(id, full_name, email, phone, avatar_url, auth_user_id, user_type),
          user_roles(role:roles(id, code, label))
        `)
        .eq("tenant_id", tenantId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .filter((r: any) => r.profile && r.profile.user_type !== "customer")
        .map((r: any) => ({
          id: r.id,
          tenant_id: r.tenant_id,
          profile_id: r.profile_id,
          status: r.status,
          is_primary_contact: r.is_primary_contact,
          created_at: r.created_at,
          profile: r.profile,
          roles: (r.user_roles ?? []).map((ur: any) => ur.role).filter(Boolean),
        }));
    },
  });
}

/** Roles available for assignment. Excludes customer + platform_owner. */
export function useAssignableRoles(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["roles_assignable", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<RoleRow[]> => {
      const { data, error } = await supabase
        .from("roles")
        .select("id, code, label, description, is_system_role")
        .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
        .not("code", "in", "(customer,platform_owner)")
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
  });
}

export function usePermissionsCatalog() {
  return useQuery({
    queryKey: ["permissions_catalog"],
    queryFn: async (): Promise<PermissionRow[]> => {
      const { data, error } = await supabase
        .from("permissions")
        .select("id, code, label, description")
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PermissionRow[];
    },
  });
}

export function useRolePermissionsMatrix() {
  return useQuery({
    queryKey: ["role_permissions_matrix"],
    queryFn: async (): Promise<{ byCode: Record<string, string[]>; byId: Set<string> }> => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role_id, permission_id, role:roles(code), permission:permissions(code)");
      if (error) throw error;
      const byCode: Record<string, string[]> = {};
      const byId = new Set<string>();
      for (const r of (data ?? []) as any[]) {
        const roleCode = r.role?.code;
        const permCode = r.permission?.code;
        if (roleCode && permCode) (byCode[roleCode] ||= []).push(permCode);
        if (r.role_id && r.permission_id) byId.add(`${r.role_id}:${r.permission_id}`);
      }
      return { byCode, byId };
    },
  });
}

/** Replace the role set on a tenant_user with the given list of role ids. */
export function useSetUserRoles(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantUserId, roleIds }: { tenantUserId: string; roleIds: string[] }) => {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("tenant_user_id", tenantUserId);
      if (delErr) throw delErr;
      if (roleIds.length) {
        const { error: insErr } = await supabase
          .from("user_roles")
          .insert(roleIds.map((role_id) => ({ tenant_user_id: tenantUserId, role_id })));
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_members", tenantId] });
    },
  });
}

export function useSetUserStatus(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantUserId, status }: { tenantUserId: string; status: "active" | "inactive" }) => {
      const { error } = await supabase.from("tenant_users").update({ status }).eq("id", tenantUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_members", tenantId] });
    },
  });
}

/** Remove a user from the current tenant (via edge function). */
export function useRemoveTenantUser(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenantUserId: string) => {
      const { data, error } = await supabase.functions.invoke("remove-tenant-user", {
        body: { tenant_id: tenantId, tenant_user_id: tenantUserId },
      });
      if (error) {
        let detail = error.message;
        try {
          const anyErr = error as unknown as { context?: Response };
          if (anyErr.context?.text) {
            const txt = await anyErr.context.text();
            try { detail = JSON.parse(txt)?.error ?? txt; } catch { detail = txt; }
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      if (data && (data as any).error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_members", tenantId] });
    },
  });
}

/** Resend an invite email for an existing (or new) user. */
export async function resendInvite(params: { tenantId: string; email: string; fullName?: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: {
      tenant_id: params.tenantId,
      email: params.email.trim().toLowerCase(),
      full_name: (params.fullName ?? "").trim(),
      role_ids: [],
      mode: "resend",
    },
  });
  if (error) {
    let detail = error.message;
    try {
      const anyErr = error as unknown as { context?: Response };
      if (anyErr.context?.text) {
        const txt = await anyErr.context.text();
        try { detail = JSON.parse(txt)?.error ?? txt; } catch { detail = txt; }
      }
    } catch { /* ignore */ }
    return { ok: false, error: detail };
  }
  if (data && (data as any).error) return { ok: false, error: (data as any).error };
  return { ok: true };
}

// -------- Roles CRUD --------

/** Edit a tenant user's name / email, and optionally set their password directly. */
export async function manageUser(params: {
  tenantId: string;
  tenantUserId: string;
  fullName?: string;
  email?: string;
  password?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("manage-user", {
    body: {
      tenant_id: params.tenantId,
      tenant_user_id: params.tenantUserId,
      ...(params.fullName !== undefined ? { full_name: params.fullName } : {}),
      ...(params.email !== undefined ? { email: params.email } : {}),
      ...(params.password ? { password: params.password } : {}),
    },
  });
  if (error) {
    let detail = error.message;
    try {
      const anyErr = error as unknown as { context?: Response };
      if (anyErr.context?.text) {
        const txt = await anyErr.context.text();
        try { detail = JSON.parse(txt)?.error ?? txt; } catch { detail = txt; }
      }
    } catch { /* ignore */ }
    return { ok: false, error: detail };
  }
  if (data && (data as any).error) return { ok: false, error: (data as any).error };
  return { ok: true };
}

export function useCreateRole(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { code: string; label: string; description?: string | null }) => {
      const { data, error } = await supabase
        .from("roles")
        .insert({
          tenant_id: tenantId,
          code: row.code,
          label: row.label,
          description: row.description ?? null,
          is_system_role: false,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles_assignable"] });
      qc.invalidateQueries({ queryKey: ["role_permissions_matrix"] });
    },
  });
}

export function useUpdateRole(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { id: string; label?: string; description?: string | null }) => {
      const patch: any = {};
      if (row.label !== undefined) patch.label = row.label;
      if (row.description !== undefined) patch.description = row.description;
      const { error } = await supabase.from("roles").update(patch).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles_assignable"] });
    },
  });
}

export function useDeleteRole(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roleId: string) => {
      // Clean dependent rows first (in case of no FK cascades).
      await supabase.from("role_permissions").delete().eq("role_id", roleId);
      await supabase.from("user_roles").delete().eq("role_id", roleId);
      const { error } = await supabase.from("roles").delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles_assignable"] });
      qc.invalidateQueries({ queryKey: ["role_permissions_matrix"] });
      qc.invalidateQueries({ queryKey: ["tenant_members", tenantId] });
    },
  });
}

export function useToggleRolePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { roleId: string; permissionId: string; enabled: boolean }) => {
      if (args.enabled) {
        const { error } = await supabase
          .from("role_permissions")
          .insert({ role_id: args.roleId, permission_id: args.permissionId } as any);
        if (error && !String(error.message).includes("duplicate")) throw error;
      } else {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role_id", args.roleId)
          .eq("permission_id", args.permissionId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role_permissions_matrix"] });
    },
  });
}

/** Add an existing profile (looked up by email) to the current tenant with initial roles. */
export async function addExistingUserToTenant(params: {
  tenantId: string;
  email: string;
  roleIds: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = params.email.trim().toLowerCase();
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!profile) return { ok: false, error: `No profile found for ${email}. Use "Invite by email" to send a signup invite.` };

  const { data: existing } = await supabase
    .from("tenant_users")
    .select("id, status")
    .eq("tenant_id", params.tenantId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  let tenantUserId = existing?.id;
  if (!tenantUserId) {
    const { data: created, error: cErr } = await supabase
      .from("tenant_users")
      .insert({ tenant_id: params.tenantId, profile_id: profile.id, status: "active" })
      .select("id")
      .single();
    if (cErr) return { ok: false, error: cErr.message };
    tenantUserId = created.id;
  } else if (existing?.status !== "active") {
    await supabase.from("tenant_users").update({ status: "active" }).eq("id", tenantUserId);
  }

  if (params.roleIds.length) {
    await supabase.from("user_roles").delete().eq("tenant_user_id", tenantUserId);
    const { error: rErr } = await supabase
      .from("user_roles")
      .insert(params.roleIds.map((role_id) => ({ tenant_user_id: tenantUserId!, role_id })));
    if (rErr) return { ok: false, error: rErr.message };
  }
  return { ok: true };
}

/** Invite a brand-new user via the invite-user edge function. */
export async function inviteNewUser(params: {
  tenantId: string;
  email: string;
  fullName: string;
  roleIds: string[];
  /** When set, the user is created immediately with this password (no invite email). */
  password?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: {
      tenant_id: params.tenantId,
      email: params.email.trim().toLowerCase(),
      full_name: params.fullName.trim(),
      role_ids: params.roleIds,
      ...(params.password ? { mode: "create", password: params.password } : {}),
    },
  });
  if (error) {
    // Supabase's FunctionsHttpError swallows the real message as a generic
    // "non-2xx status". Read the response body so we surface the actual error.
    let detail = error.message;
    try {
      const anyErr = error as unknown as { context?: Response };
      if (anyErr.context && typeof anyErr.context.text === "function") {
        const txt = await anyErr.context.text();
        if (txt) {
          try {
            const parsed = JSON.parse(txt);
            detail = parsed?.error ?? parsed?.message ?? txt;
          } catch {
            detail = txt;
          }
        }
      }
    } catch { /* ignore */ }
    return { ok: false, error: detail };
  }
  if (data && (data as any).error) return { ok: false, error: (data as any).error };
  return { ok: true };
}