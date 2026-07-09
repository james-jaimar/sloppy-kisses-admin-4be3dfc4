import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

export default function RequirePlatform() {
  const { authUser, loading: authLoading } = useAuth();
  const { profile, loading } = useCurrentUser();
  const location = useLocation();

  if (authLoading || (loading && !profile)) {
    return (
      <div className="grid min-h-screen place-items-center bg-sk-bg">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Hide the entire platform area from anyone who isn't a platform owner —
  // render 404 so tenant staff never even discover it exists.
  if (!profile || profile.user_type !== "platform") {
    return <Navigate to="/404" replace />;
  }

  return <Outlet />;
}