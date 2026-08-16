import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { ClipboardList, Hotel, Dog, Truck, User, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useWorkDepts } from "./useWorkDepts";

export default function WorkLayout() {
  const { authUser, loading: authLoading } = useAuth();
  const { profile, loading } = useCurrentUser();
  const { depts, canAccess } = useWorkDepts();
  const location = useLocation();

  if (authLoading || (loading && !profile)) {
    return (
      <div className="grid min-h-screen place-items-center bg-sk-bg">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!authUser) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (profile?.user_type === "customer") return <Navigate to="/customer/dashboard" replace />;
  if (!canAccess) {
    return (
      <div className="grid min-h-screen place-items-center bg-sk-bg px-6 text-center">
        <div className="max-w-sm rounded-2xl border border-border bg-white p-6">
          <AlertTriangle className="mx-auto h-8 w-8 text-sk-orange" />
          <h1 className="mt-3 text-lg font-semibold">No work mode access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask an administrator to give you the "Work mode access" permission.
          </p>
        </div>
      </div>
    );
  }

  const tabs = [
    { to: "/work", label: "My day", icon: ClipboardList, end: true, show: true },
    { to: "/work/hotel", label: "Hotel", icon: Hotel, show: depts.includes("hotel") },
    { to: "/work/daycare", label: "Daycare", icon: Dog, show: depts.includes("daycare") },
    {
      to: "/work/vans",
      label: "Route",
      icon: Truck,
      show: depts.includes("transport") || depts.includes("grooming_mobile"),
    },
    { to: "/work/me", label: "Me", icon: User, show: true },
  ].filter((t) => t.show);

  return (
    <div className="flex min-h-screen flex-col bg-sk-bg text-foreground">
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors ${
                  isActive ? "text-sk-coral" : "text-muted-foreground"
                }`
              }
            >
              <t.icon className="h-6 w-6" />
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}