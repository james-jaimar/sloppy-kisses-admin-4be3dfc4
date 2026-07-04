import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { PawPrint, Upload, CalendarPlus, Receipt, MessageSquare, AlertCircle, Calendar as CalendarIcon } from "lucide-react";

const pets = [
  { name: "Max",   breed: "Golden Retriever", vacc: "up_to_date" as const, next: "Grooming · Thu 10 Jul" },
  { name: "Bella", breed: "Cavoodle",         vacc: "expiring"   as const, next: "Daycare · Mon 14 Jul" },
];

const upcoming = [
  { pet: "Max",   what: "Full Groom",         when: "Thu 10 Jul · 09:30", status: "confirmed" },
  { pet: "Bella", what: "Daycare (3-day plan)", when: "Mon 14 Jul · 07:30", status: "confirmed" },
  { pet: "Max",   what: "Pick Up / Drop Off", when: "Fri 25 Jul · 07:15", status: "requested" },
];

const quickActions = [
  { label: "Add pet",         icon: PawPrint,    tone: "coral" },
  { label: "Upload document", icon: Upload,      tone: "turquoise" },
  { label: "Request booking", icon: CalendarPlus, tone: "green" },
  { label: "View invoices",   icon: Receipt,     tone: "orange" },
  { label: "Message us",      icon: MessageSquare, tone: "coral" },
] as const;

const toneMap: Record<string, string> = {
  coral: "bg-sk-coral-soft text-sk-coral-dark",
  turquoise: "bg-sk-turquoise-soft text-sk-turquoise-dark",
  green: "bg-sk-green-soft text-sk-green",
  orange: "bg-sk-orange-soft text-sk-orange",
};

export default function CustomerDashboard() {
  return (
    <>
      <AppHeader
        title="Welcome back, Sarah 👋"
        subtitle="Here's what's happening with Max and Bella"
      />
      <div className="flex-1 space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="sk-card p-5">
            <div className="sk-stat-label">Upcoming bookings</div>
            <div className="mt-2 sk-stat-value">3</div>
            <div className="mt-1 text-xs text-muted-foreground">Next: Thursday</div>
          </div>
          <div className="sk-card p-5">
            <div className="sk-stat-label">Outstanding balance</div>
            <div className="mt-2 text-3xl font-semibold text-sk-coral-dark">R 480</div>
            <button className="mt-1 text-xs font-medium text-sk-coral-dark hover:underline">Pay now</button>
          </div>
          <div className="sk-card p-5">
            <div className="sk-stat-label flex items-center gap-1"><AlertCircle className="h-3 w-3 text-sk-orange" /> Documents needed</div>
            <div className="mt-2 sk-stat-value">1</div>
            <div className="mt-1 text-xs text-muted-foreground">Bella's vaccination</div>
          </div>
          <div className="sk-card p-5">
            <div className="sk-stat-label flex items-center gap-1"><CalendarIcon className="h-3 w-3 text-sk-turquoise" /> Next daycare day</div>
            <div className="mt-2 text-lg font-semibold">Monday, 14 Jul</div>
            <div className="mt-1 text-xs text-muted-foreground">Bella · 3-day plan</div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="sk-card lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Upcoming bookings</h2>
              <button className="text-sm font-medium text-sk-coral-dark hover:underline">View all</button>
            </div>
            <ul className="divide-y divide-border">
              {upcoming.map((u, i) => (
                <li key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-sk-turquoise-soft text-sk-turquoise-dark font-semibold">
                    {u.pet[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{u.what} · {u.pet}</div>
                    <div className="text-xs text-muted-foreground">{u.when}</div>
                  </div>
                  <StatusBadge status={u.status} />
                </li>
              ))}
            </ul>
          </div>

          <div className="sk-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Quick actions</h2>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4">
              {quickActions.map((q) => {
                const Icon = q.icon;
                return (
                  <button key={q.label} className="flex flex-col items-start gap-2 rounded-xl border border-border p-3 text-left hover:bg-sk-surface-muted">
                    <span className={"grid h-9 w-9 place-items-center rounded-lg " + toneMap[q.tone]}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium">{q.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-base font-semibold">My pets</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {pets.map((p) => (
              <div key={p.name} className="sk-card flex items-center gap-4 p-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-sk-coral-soft text-sk-coral-dark text-lg font-semibold">
                  {p.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">{p.name}</span>
                    <StatusBadge status={p.vacc} />
                  </div>
                  <div className="text-xs text-muted-foreground">{p.breed}</div>
                  <div className="mt-1 text-xs text-sk-turquoise-dark font-medium">Next: {p.next}</div>
                </div>
                <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">View</button>
              </div>
            ))}
          </div>
        </div>

        <div className="sk-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Recent activity</h2>
          </div>
          <ul className="divide-y divide-border text-sm">
            {[
              { txt: "Booking request submitted for Max · Pick Up / Drop Off", when: "yesterday" },
              { txt: "Invoice SK-INV-2041 sent (R 480)", when: "2 days ago" },
              { txt: "Bella checked in to daycare", when: "3 days ago" },
              { txt: "Vaccination reminder for Bella", when: "5 days ago" },
            ].map((a, i) => (
              <li key={i} className="flex items-center justify-between px-5 py-3">
                <span>{a.txt}</span>
                <span className="text-xs text-muted-foreground">{a.when}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}