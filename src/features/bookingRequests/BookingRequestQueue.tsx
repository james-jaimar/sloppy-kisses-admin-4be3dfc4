import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { demoBookingRequests } from "@/constants/demoData";
import { Check, X, MessageCircle, ArrowRight, FileText, PawPrint, User, Calendar, Paperclip } from "lucide-react";

const filters = ["All", "Pending Review", "Needs Info", "Approved", "Declined"] as const;

const summary = [
  { label: "Pending review", value: 3, tone: "text-sk-orange" },
  { label: "Needs info",     value: 1, tone: "text-sk-orange" },
  { label: "Approved today", value: 1, tone: "text-sk-green" },
  { label: "Declined",       value: 1, tone: "text-sk-coral-dark" },
];

export default function BookingRequestQueue() {
  const [selectedId, setSelectedId] = useState(demoBookingRequests[0].id);
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("All");
  const selected = demoBookingRequests.find((r) => r.id === selectedId)!;

  return (
    <>
      <AppHeader
        title="Booking requests"
        subtitle="Review, approve or convert incoming requests"
        tabs={filters.map((f) => ({ label: f, active: f === activeFilter }))}
      />
      <div className="flex-1 space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {summary.map((s) => (
            <div key={s.label} className="sk-card p-5">
              <div className={"text-3xl font-semibold " + s.tone}>{s.value}</div>
              <div className="mt-1 sk-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          {/* List */}
          <div className="sk-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Incoming requests</h2>
              <span className="text-xs text-muted-foreground">{demoBookingRequests.length} total</span>
            </div>
            <ul className="divide-y divide-border">
              {demoBookingRequests.map((r) => {
                const active = r.id === selectedId;
                return (
                  <li
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={
                      "cursor-pointer px-5 py-4 transition-colors " +
                      (active ? "bg-sk-coral-soft/60" : "hover:bg-sk-surface-muted/60")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          {r.customer}
                          {r.hasDocs && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{r.pet}</div>
                        <div className="mt-1 text-xs">
                          <span className="font-medium">{r.service}</span>
                          <span className="text-muted-foreground"> · {r.preferred}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <StatusBadge status={r.status} />
                        <span className="text-[11px] text-muted-foreground">{r.createdAt}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Detail */}
          <div className="sk-card flex flex-col">
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{selected.service}</h2>
                  <p className="text-xs text-muted-foreground">Request {selected.id.toUpperCase()} · {selected.createdAt}</p>
                </div>
                <StatusBadge status={selected.status} />
              </div>
            </div>
            <div className="flex-1 space-y-5 p-5">
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <User className="h-3.5 w-3.5" /> Customer
                </div>
                <div className="rounded-xl border border-border bg-sk-surface-muted p-3 text-sm">
                  <div className="font-medium">{selected.customer}</div>
                  <div className="text-xs text-muted-foreground">example.customer@email.com · +27 82 555 0000</div>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <PawPrint className="h-3.5 w-3.5" /> Pet
                </div>
                <div className="rounded-xl border border-border bg-sk-surface-muted p-3 text-sm">{selected.pet}</div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" /> Preferred dates / times
                </div>
                <div className="rounded-xl border border-border bg-sk-surface-muted p-3 text-sm">{selected.preferred}</div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" /> Uploaded documents
                </div>
                <div className="rounded-xl border border-dashed border-border p-3 text-sm">
                  {selected.hasDocs ? (
                    <div className="flex items-center gap-2 text-sk-turquoise-dark">
                      <Paperclip className="h-4 w-4" /> vaccination.pdf
                    </div>
                  ) : (
                    <div className="text-muted-foreground">No documents uploaded yet</div>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal notes</div>
                <textarea
                  rows={3}
                  placeholder="Notes only visible to staff..."
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sk-coral/40"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-border p-4 sm:grid-cols-4">
              <button className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-muted">
                <X className="h-4 w-4" /> Decline
              </button>
              <button className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-muted">
                <MessageCircle className="h-4 w-4" /> Request info
              </button>
              <button className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sk-turquoise px-3 py-2 text-sm font-semibold text-white hover:bg-sk-turquoise-dark">
                <Check className="h-4 w-4" /> Approve
              </button>
              <button className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sk-coral px-3 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark">
                Convert <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}