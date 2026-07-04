import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-sk-bg px-6 text-center">
      <div className="max-w-md">{children}</div>
    </div>
  );
}

export default function RequireAdmin() {
  const { authUser, loading: authLoading } = useAuth();
  const { profile, memberships, currentTenant, loading, error } = useCurrentUser();
  const location = useLocation();

  if (authLoading) {
    return (
      <FullScreen>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading session…
        </div>
      </FullScreen>
    );
  }

  if (!authUser) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (loading) {
    return (
      <FullScreen>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
        </div>
      </FullScreen>
    );
  }

  if (error) {
    return (
      <FullScreen>
        <div className="rounded-2xl border border-border bg-white p-6">
          <div className="mb-2 flex items-center justify-center gap-2 text-sk-coral-dark">
            <ShieldAlert className="h-5 w-5" />
            <h1 className="text-base font-semibold">Couldn't load your account</h1>
          </div>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </FullScreen>
    );
  }

  if (!profile) {
    return (
      <FullScreen>
        <div className="rounded-2xl border border-border bg-white p-6">
          <h1 className="text-base font-semibold">No profile found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your Supabase account isn't linked to a Sloppy Kisses profile yet. Contact an administrator.
          </p>
        </div>
      </FullScreen>
    );
  }

  const isPlatform = profile.user_type === "platform";
  if (!isPlatform && (memberships.length === 0 || !currentTenant)) {
    return (
      <FullScreen>
        <div className="rounded-2xl border border-border bg-white p-6">
          <div className="mb-2 flex items-center justify-center gap-2 text-sk-coral-dark">
            <ShieldAlert className="h-5 w-5" />
            <h1 className="text-base font-semibold">No tenant access</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Your profile has no active tenant memberships. Ask a tenant owner to add you.
          </p>
        </div>
      </FullScreen>
    );
  }

  return <Outlet />;
}