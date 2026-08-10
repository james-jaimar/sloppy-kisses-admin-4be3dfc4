import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

/** True when the current tenant has this module switched on. */
export function useFeature(key: string): boolean {
  const { hasFeature } = useCurrentUser();
  return hasFeature(key);
}

/** Renders children only when the module is on for this tenant. */
export function Feature({
  code,
  fallback = null,
  children,
}: {
  code: string;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  return <>{useFeature(code) ? children : fallback}</>;
}

/** Route guard — a disabled module is a dead end, not a lock screen. */
export function RequireFeature({ code, redirectTo = "/admin/home" }: { code: string; redirectTo?: string }) {
  const { loading, profile } = useCurrentUser();
  const ok = useFeature(code);
  if (loading && !profile) return null;
  if (!ok) return <Navigate to={redirectTo} replace />;
  return <Outlet />;
}
