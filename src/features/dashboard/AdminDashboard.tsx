import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { Scissors, Truck, Dog, Hotel, ArrowLeftRight, TrendingUp, TrendingDown, ChevronRight, Users, PawPrint } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { useCustomerAndPetCounts } from "@/features/customers/queries";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import {
  useDashboardTodayStats,
  useTodaysSchedule,
  useDaycareCheckinSummary,
  useRecentActivity,
} from "./queries";

const toneChip: Record<string, string> = {
  coral: "bg-sk-coral-soft text-sk-coral-dark",
  turquoise: "bg-sk-turquoise-soft text-sk-turquoise-dark",
  green: "bg-sk-green-soft text-sk-green",
  orange: "bg-sk-orange-soft text-sk-orange",
};

const SERVICE_LABEL: Record<string, string> = {
  grooming_inhouse: "In-house grooming",
  grooming_mobile: "Mobile grooming",
  daycare: "Daycare",
  daycare_assessment: "Daycare assessment",
  hotel_dog: "Hotel",
  hotel_cat: "Cattery",
  pickup_dropoff: "Pick-up / drop-off",
};

function activityHref(a: { booking_id: string | null; customer_id: string | null; pet_id: string | null }) {
  if (a.booking_id) return `/admin/bookings/${a.booking_id}`;
  if (a.pet_id) return `/admin/pets/${a.pet_id}`;
  if (a.customer_id) return `/admin/customers/${a.customer_id}`;
  return null;
}

export default function AdminDashboard() {
  const today = format(new Date(), "EEEE, d MMMM");
  const { profile, currentTenant } = useCurrentUser();
  const tenantId = currentTenant?.id ?? null;
  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "there";
  const { data: counts, isLoading: countsLoading } = useCustomerAndPetCounts();
  const { data: statsData, isLoading: statsLoading } = useDashboardTodayStats(tenantId);
  const { data: schedule, isLoading: scheduleLoading } = useTodaysSchedule(tenantId);
  const { data: checkin, isLoading: checkinLoading } = useDaycareCheckinSummary(tenantId);
  const { data: activity, isLoading: activityLoading } = useRecentActivity(tenantId);

  const statCards = [
    { key: "grooming", label: "Today's Grooming", href: "/admin/grooming", ...statsData?.grooming, icon: Scissors, tone: "coral" },
    { key: "mobile", label: "Mobile Appointments", href: "/admin/mobile-vans", ...statsData?.mobile, icon: Truck, tone: "turquoise" },
    { key: "daycare", label: "Daycare Dogs", href: "/admin/daycare", ...statsData?.daycare, icon: Dog, tone: "green" },
    { key: "hotel", label: "Hotel Guests", href: "/admin/hotel-cattery", ...statsData?.hotel, icon: Hotel, tone: "orange" },
    { key: "pickup", label: "Pick Ups / Drop Offs", href: "/admin/pickup-dropoff", ...statsData?.transport, icon: ArrowLeftRight, tone: "coral" },
  ].map((s) => {
    const today = (s as any).today ?? 0;
    const yday = (s as any).yday ?? 0;
    const delta = today - yday;
    return { ...s, value: today, delta, trend: delta >= 0 ? "up" : "down" };
  });

  const checkins = [
    { label: "Expected", value: checkin?.expected ?? 0, href: "/admin/daycare/attendance" },
    { label: "Checked in", value: checkin?.checkedIn ?? 0, href: "/admin/daycare/attendance" },
    { label: "Not arrived", value: checkin?.notArrived ?? 0, href: "/admin/daycare/attendance" },
    { label: "Walk-ins", value: checkin?.walkIns ?? 0, href: "/admin/daycare/attendance" },
  ];

  return (
    <>
      <AppHeader
        title="Dashboard"
        subtitle={`Good morning, ${firstName} — here's what's happening ${today}.`}
        actions={
          <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-medium hover:bg-muted">
            Today
            <ChevronRight className="h-4 w-4" />
          </button>
        }
      />
      <div className="flex-1 space-y-6 p-6">
        {/* CRM totals — real data */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Link to="/admin/customers" className="sk-card p-5 transition-colors hover:border-sk-coral">
            <div className="flex items-start justify-between">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-sk-turquoise-soft text-sk-turquoise-dark">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 sk-stat-value tabular-nums">
              {countsLoading ? "…" : counts?.customers.toLocaleString() ?? 0}
            </div>
            <div className="sk-stat-label mt-1">Customers</div>
          </Link>
          <Link to="/admin/pets" className="sk-card p-5 transition-colors hover:border-sk-coral">
            <div className="flex items-start justify-between">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-sk-coral-soft text-sk-coral-dark">
                <PawPrint className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 sk-stat-value tabular-nums">
              {countsLoading ? "…" : counts?.pets.toLocaleString() ?? 0}
            </div>
            <div className="sk-stat-label mt-1">Pets</div>
          </Link>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {statCards.map((s) => {
            const Icon = s.icon;
            const TrendIcon = s.trend === "up" ? TrendingUp : TrendingDown;
            const deltaLabel = s.delta === 0 ? "0" : (s.delta > 0 ? `+${s.delta}` : `${s.delta}`);
            return (
              <Link key={s.key} to={s.href} className="sk-card p-5 transition-colors hover:border-sk-coral">
                <div className="flex items-start justify-between">
                  <div className={"grid h-10 w-10 place-items-center rounded-xl " + toneChip[s.tone]}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-4 sk-stat-value tabular-nums">{statsLoading ? "…" : s.value}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="sk-stat-label">{s.label}</span>
                  {!statsLoading && s.delta !== 0 && (
                    <span className={"inline-flex items-center gap-0.5 text-xs font-medium " + (s.trend === "up" ? "text-sk-green" : "text-sk-coral")}>
                      <TrendIcon className="h-3 w-3" />
                      {deltaLabel}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Today's schedule */}
          <div className="sk-card lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">Today's schedule</h2>
                <p className="text-xs text-muted-foreground">Grooming, mobile & pick-ups</p>
              </div>
              <Link to="/admin/calendar" className="text-sm font-medium text-sk-coral-dark hover:underline">Open calendar</Link>
            </div>
            <div className="divide-y divide-border">
              {scheduleLoading && (
                <div className="px-5 py-6 text-sm text-muted-foreground">Loading…</div>
              )}
              {!scheduleLoading && (schedule?.length ?? 0) === 0 && (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">No bookings scheduled for today.</div>
              )}
              {schedule?.map((b) => {
                const time = b.start_at ? format(new Date(b.start_at), "HH:mm") : "—";
                const pets = b.booking_pets
                  .map((bp) => bp.pet?.name)
                  .filter(Boolean)
                  .join(", ") || "—";
                const owner = b.customer?.full_name ?? "—";
                const service = SERVICE_LABEL[b.service_type] ?? b.service_type;
                const resource = b.resource?.name;
                return (
                  <Link key={b.id} to={`/admin/bookings/${b.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-sk-surface-muted">
                    <div className="w-16 text-sm font-semibold tabular-nums">{time}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{pets} <span className="text-muted-foreground font-normal">· {owner}</span></div>
                      <div className="text-xs text-muted-foreground truncate">{service}{resource ? ` · ${resource}` : ""}</div>
                    </div>
                    <StatusBadge status={b.status} />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Daycare check-in summary */}
          <div className="sk-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">Daycare check-in</h2>
                <p className="text-xs text-muted-foreground">Live count for today</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 p-5">
              {checkins.map((c) => (
                <Link key={c.label} to={c.href} className="rounded-xl border border-border bg-sk-surface-muted p-4 transition-colors hover:border-sk-coral">
                  <div className="text-2xl font-semibold tabular-nums">{checkinLoading ? "…" : c.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{c.label}</div>
                </Link>
              ))}
            </div>
            <div className="border-t border-border px-5 py-3">
              <Link to="/admin/daycare/attendance" className="block w-full rounded-xl bg-sk-turquoise-soft py-2 text-center text-sm font-semibold text-sk-turquoise-dark hover:bg-sk-turquoise-soft/70">
                Open daily list
              </Link>
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="sk-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Recent activity</h2>
            <Link to="/admin/comms" className="text-sm font-medium text-sk-coral-dark hover:underline">View all</Link>
          </div>
          <ul className="divide-y divide-border">
            {activityLoading && (
              <li className="px-5 py-6 text-sm text-muted-foreground">Loading…</li>
            )}
            {!activityLoading && (activity?.length ?? 0) === 0 && (
              <li className="px-5 py-10 text-center text-sm text-muted-foreground">No activity yet.</li>
            )}
            {activity?.map((a) => {
              const href = activityHref(a);
              const body = (
                <>
                  <div className="mt-1 h-2 w-2 rounded-full bg-sk-turquoise" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{a.actor_name ?? "System"}</span>{" "}
                    <span className="text-muted-foreground">{a.title ?? a.activity_type}</span>
                    {a.description ? <span className="text-muted-foreground"> — {a.description}</span> : null}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </span>
                </>
              );
              return (
                <li key={a.id}>
                  {href ? (
                    <Link to={href} className="flex items-start gap-3 px-5 py-3.5 text-sm hover:bg-sk-surface-muted">{body}</Link>
                  ) : (
                    <div className="flex items-start gap-3 px-5 py-3.5 text-sm">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}