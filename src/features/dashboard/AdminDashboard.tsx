import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { demoTodayGrooming } from "@/constants/demoData";
import { Scissors, Truck, Dog, Hotel, ArrowLeftRight, TrendingUp, TrendingDown, MoreHorizontal, ChevronRight } from "lucide-react";
import { format } from "date-fns";

const stats = [
  { key: "grooming", label: "Today's Grooming", value: 12, delta: "+3", trend: "up",   icon: Scissors,       tone: "coral" },
  { key: "mobile",   label: "Mobile Appointments", value: 5, delta: "+1", trend: "up",   icon: Truck,          tone: "turquoise" },
  { key: "daycare",  label: "Daycare Dogs",     value: 24, delta: "-2", trend: "down", icon: Dog,            tone: "green" },
  { key: "hotel",    label: "Hotel Guests",     value: 18, delta: "0",  trend: "up",   icon: Hotel,          tone: "orange" },
  { key: "pickup",   label: "Pick Ups / Drop Offs", value: 7, delta: "+2", trend: "up", icon: ArrowLeftRight, tone: "coral" },
] as const;

const toneChip: Record<string, string> = {
  coral: "bg-sk-coral-soft text-sk-coral-dark",
  turquoise: "bg-sk-turquoise-soft text-sk-turquoise-dark",
  green: "bg-sk-green-soft text-sk-green",
  orange: "bg-sk-orange-soft text-sk-orange",
};

const checkins = [
  { label: "Expected",  value: 26, tone: "muted" },
  { label: "Checked in", value: 18, tone: "green" },
  { label: "Not arrived", value: 6, tone: "orange" },
  { label: "Walk-ins",   value: 2, tone: "coral" },
];

const activity = [
  { who: "Nomvula", what: "checked in", target: "Max (Sarah Johnson)", when: "2 min ago" },
  { who: "Charlotte", what: "approved booking request from", target: "Amelia Roberts", when: "18 min ago" },
  { who: "Kagiso", what: "marked", target: "Rocky's groom as in progress", when: "42 min ago" },
  { who: "System", what: "sent invoice", target: "SK-INV-2041 to Priya Naidoo", when: "1 h ago" },
  { who: "Sipho", what: "logged pick-up for", target: "Kiara (Rethabile Dube)", when: "1 h ago" },
];

export default function AdminDashboard() {
  const today = format(new Date(), "EEEE, d MMMM");
  return (
    <>
      <AppHeader
        title="Dashboard"
        subtitle={`Good morning, Charlotte — here's what's happening ${today}.`}
        actions={
          <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-medium hover:bg-muted">
            Today
            <ChevronRight className="h-4 w-4" />
          </button>
        }
      />
      <div className="flex-1 space-y-6 p-6">
        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((s) => {
            const Icon = s.icon;
            const TrendIcon = s.trend === "up" ? TrendingUp : TrendingDown;
            return (
              <div key={s.key} className="sk-card p-5">
                <div className="flex items-start justify-between">
                  <div className={"grid h-10 w-10 place-items-center rounded-xl " + toneChip[s.tone]}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <button className="text-muted-foreground hover:text-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 sk-stat-value">{s.value}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="sk-stat-label">{s.label}</span>
                  <span className={"inline-flex items-center gap-0.5 text-xs font-medium " + (s.trend === "up" ? "text-sk-green" : "text-sk-coral")}>
                    <TrendIcon className="h-3 w-3" />
                    {s.delta}
                  </span>
                </div>
              </div>
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
              <button className="text-sm font-medium text-sk-coral-dark hover:underline">Open calendar</button>
            </div>
            <div className="divide-y divide-border">
              {demoTodayGrooming.map((b) => (
                <div key={b.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-16 text-sm font-semibold tabular-nums">{b.time}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{b.pet} <span className="text-muted-foreground font-normal">· {b.owner}</span></div>
                    <div className="text-xs text-muted-foreground">{b.service} · with {b.groomer}</div>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              ))}
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
                <div key={c.label} className="rounded-xl border border-border bg-sk-surface-muted p-4">
                  <div className="text-2xl font-semibold">{c.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{c.label}</div>
                </div>
              ))}
            </div>
            <div className="border-t border-border px-5 py-3">
              <button className="w-full rounded-xl bg-sk-turquoise-soft py-2 text-sm font-semibold text-sk-turquoise-dark hover:bg-sk-turquoise-soft/70">
                Open daily list
              </button>
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="sk-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Recent activity</h2>
            <button className="text-sm font-medium text-muted-foreground hover:text-foreground">View all</button>
          </div>
          <ul className="divide-y divide-border">
            {activity.map((a, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-3.5 text-sm">
                <div className="mt-1 h-2 w-2 rounded-full bg-sk-turquoise" />
                <div className="flex-1">
                  <span className="font-medium">{a.who}</span>{" "}
                  <span className="text-muted-foreground">{a.what}</span>{" "}
                  <span className="font-medium">{a.target}</span>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{a.when}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}