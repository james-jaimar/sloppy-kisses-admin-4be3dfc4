import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Building2, Users, Flag, History, Activity, Database, ShieldCheck, ArrowRight } from "lucide-react";
import { useAllTenants, useAllPlatformProfiles, useFlags, useTableCount } from "./queries";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="sk-card p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-sk-turquoise-soft text-sk-turquoise-dark">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold">{value}</div>
        </div>
      </div>
    </div>
  );
}

const shortcuts = [
  { to: "/platform/tenants", label: "Tenants", icon: Building2, desc: "Every tenant on the platform" },
  { to: "/platform/users", label: "Platform users", icon: Users, desc: "All profiles across tenants" },
  { to: "/platform/flags", label: "Feature flags", icon: Flag, desc: "Gate WIP features without a deploy" },
  { to: "/platform/audit", label: "Audit log", icon: History, desc: "Platform-owner actions" },
  { to: "/platform/activity", label: "Activity & events", icon: Activity, desc: "notification_events, audit_log" },
  { to: "/platform/system", label: "System & secrets", icon: Database, desc: "Supabase deep-links & secret checklist" },
];

export default function PlatformOverviewPage() {
  const { profile } = useCurrentUser();
  const tenants = useAllTenants();
  const users = useAllPlatformProfiles();
  const flags = useFlags();
  const bookingsCount = useTableCount("bookings");

  return (
    <>
      <AppHeader
        title="Sys Dev"
        subtitle={`Signed in as ${profile?.email ?? "\u2014"} — this area is invisible to tenant users.`}
      />
      <div className="flex-1 p-6 space-y-6">
        <div className="flex items-center gap-2 rounded-xl border border-sk-coral-soft bg-sk-coral-soft/40 px-4 py-3 text-sm text-sk-coral-dark">
          <ShieldCheck className="h-4 w-4" />
          <span>Platform-owner mode active. Every permission gate short-circuits to allow.</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Tenants" value={tenants.data?.length ?? "\u2013"} icon={Building2} />
          <StatCard label="Profiles" value={users.data?.length ?? "\u2013"} icon={Users} />
          <StatCard label="Bookings" value={bookingsCount.data ?? "\u2013"} icon={Activity} />
          <StatCard label="Feature flags" value={flags.data?.length ?? 0} icon={Flag} />
        </div>

        <div className="sk-card p-5">
          <h2 className="text-sm font-semibold mb-3">Jump to</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shortcuts.map((s) => {
              const Icon = s.icon;
              return (
                <Link key={s.to} to={s.to} className="group flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-muted transition-colors">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-foreground/80 group-hover:bg-sk-coral-soft group-hover:text-sk-coral-dark">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.desc}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}