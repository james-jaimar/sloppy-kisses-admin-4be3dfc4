// Permission helpers. Permission codes live in Supabase (public.permissions.code)
// and are loaded through the TenantProvider for the current user.
export { usePermissions, useCurrentUser } from "@/lib/tenant/TenantContext";

import { useCurrentUser } from "@/lib/tenant/TenantContext";

export function useHasPermission(code: string): boolean {
  const { hasPermission } = useCurrentUser();
  return hasPermission(code);
}

export function hasPermission(permissions: string[] | undefined, code: string): boolean {
  return Boolean(permissions?.includes(code));
}