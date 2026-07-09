import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

interface CanProps {
  code: string | string[];
  /** When multiple codes are passed, require ALL by default. Set any to true for OR. */
  any?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

function useCheck(code: string | string[], any = false) {
  const { hasPermission, profile } = useCurrentUser();
  const isPlatform = profile?.user_type === "platform";
  if (isPlatform) return true;
  const codes = Array.isArray(code) ? code : [code];
  if (!codes.length) return true;
  return any ? codes.some(hasPermission) : codes.every(hasPermission);
}

export function Can({ code, any, fallback = null, children }: CanProps) {
  const ok = useCheck(code, any);
  return <>{ok ? children : fallback}</>;
}

interface RequirePermissionProps {
  code: string | string[];
  any?: boolean;
}

export function RequirePermission({ code, any }: RequirePermissionProps) {
  const { loading, profile } = useCurrentUser();
  const ok = useCheck(code, any);
  const location = useLocation();

  if (loading && !profile) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  if (!ok) {
    return (
      <div className="grid min-h-[50vh] place-items-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-border bg-white p-6">
          <div className="mb-2 flex items-center justify-center gap-2 text-sk-coral-dark">
            <ShieldAlert className="h-5 w-5" />
            <h1 className="text-base font-semibold">You don't have access to this page</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Ask a tenant owner to grant you the required permission.
          </p>
          <p className="mt-2 text-[11px] font-mono text-muted-foreground">
            {Array.isArray(code) ? code.join(any ? " or " : " and ") : code}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            From <span className="font-mono">{location.pathname}</span>
          </p>
          <Navigate to="/admin/dashboard" replace />
        </div>
      </div>
    );
  }

  return <Outlet />;
}