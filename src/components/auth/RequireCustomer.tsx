import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

export default function RequireCustomer() {
  const { authUser, loading: authLoading } = useAuth();
  const { loading } = useCurrentUser();
  const location = useLocation();

  if (authLoading || loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-sk-bg text-sm text-muted-foreground">
        <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      </div>
    );
  }

  if (!authUser) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
}