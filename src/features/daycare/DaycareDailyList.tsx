import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { demoDaycareList } from "@/constants/demoData";
import { Download, Plus, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";

const counters = [
  { label: "Expected",     value: 26, tone: "text-foreground" },
  { label: "Checked in",   value: 4,  tone: "text-sk-green" },
  { label: "Not arrived",  value: 2,  tone: "text-sk-orange" },
  { label: "Walk-ins",     value: 1,  tone: "text-sk-coral-dark" },
];

export default function DaycareDailyList() {
  return (
    <>
      <AppHeader
        title="Daycare"
        subtitle="Daily attendance, plans & clients"
        tabs={[
          { label: "Overview" },
          { label: "Daily List", active: true },
          { label: "Plans" },
          { label: "Clients" },
          { label: "Reports" },
        ]}
        actions={
          <>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <Printer className="h-4 w-4" /> Print list
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <Download className="h-4 w-4" /> Export
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark">
              <Plus className="h-4 w-4" /> Add walk-in
            </button>
          </>
        }
      />
      <div className="flex-1 space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-white p-1">
            <button className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
            <div className="px-3 text-sm font-medium">{format(new Date(), "EEEE, d MMMM yyyy")}</div>
            <button className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="text-xs text-muted-foreground">Last updated 2 min ago</div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {counters.map((c) => (
            <div key={c.label} className="sk-card p-5">
              <div className={"text-3xl font-semibold " + c.tone}>{c.value}</div>
              <div className="mt-1 sk-stat-label">{c.label}</div>
            </div>
          ))}
        </div>

        <div className="sk-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Today's list</h2>
            <div className="text-xs text-muted-foreground">{demoDaycareList.length} dogs</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Dog</th>
                  <th className="px-5 py-3">Owner</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Days this month</th>
                  <th className="px-5 py-3">Arrival</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Notes</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {demoDaycareList.map((d) => (
                  <tr key={d.id} className="hover:bg-sk-surface-muted/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-sk-turquoise-soft text-sk-turquoise-dark text-xs font-semibold">
                          {d.pet[0]}
                        </div>
                        <span className="font-medium">{d.pet}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{d.owner}</td>
                    <td className="px-5 py-3">{d.plan}</td>
                    <td className="px-5 py-3 tabular-nums">{d.daysBookedThisMonth}</td>
                    <td className="px-5 py-3 tabular-nums">{d.arrival}</td>
                    <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-5 py-3 text-xs text-muted-foreground truncate max-w-[180px]">{d.notes || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <button className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-muted">
                        {d.status === "checked_in" ? "Check out" : d.status === "not_arrived" ? "Check in" : "Details"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}