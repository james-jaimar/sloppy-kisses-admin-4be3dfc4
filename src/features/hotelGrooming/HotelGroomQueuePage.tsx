import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Scissors, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useHotelGroomQueue, type HotelGroomStatus } from "./queries";
import { ScheduleHotelGroomDialog } from "./ScheduleHotelGroomDialog";

const TABS: { key: HotelGroomStatus; label: string }[] = [
  { key: "pending", label: "To schedule" },
  { key: "scheduled", label: "Scheduled" },
  { key: "declined", label: "Declined" },
];

function d(s: string | null) {
  return s ? format(new Date(s), "dd MMM") : "—";
}

export default function HotelGroomQueuePage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [tab, setTab] = useState<HotelGroomStatus>("pending");
  const q = useHotelGroomQueue(tenantId, { status: [tab] });
  const [active, setActive] = useState<any>(null);

  return (
    <>
      <AppHeader
        title="Hotel grooms to schedule"
        subtitle="Grooming asked for during a hotel stay — slot each one inside the guest's stay window."
      />
      <div className="flex-1 space-y-4 p-6">
        <div className="inline-flex overflow-hidden rounded-xl border border-border bg-white">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                "h-10 px-4 text-sm font-medium " +
                (tab === t.key ? "bg-sk-coral text-white" : "hover:bg-muted")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {q.isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !q.data?.length ? (
          <div className="sk-card p-8 text-center text-sm text-muted-foreground">
            Nothing here right now.
          </div>
        ) : (
          <div className="sk-card overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-sk-surface-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Pet</th>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-left font-medium">Stay</th>
                  <th className="px-3 py-2 text-left font-medium">Notes</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.data.map((r) => (
                  <tr key={r.id} className="hover:bg-sk-surface-muted/50">
                    <td className="px-3 py-2 font-medium">
                      {r.pet?.name ?? r.pet_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[r.customer?.first_name, r.customer?.last_name]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <Link
                        to={`/admin/bookings/${r.hotel_booking_id}`}
                        className="hover:text-sk-coral-dark hover:underline"
                      >
                        {r.hotel_booking?.booking_number ?? "Stay"}
                      </Link>{" "}
                      · {d(r.window_start)} – {d(r.window_end)}
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-2 text-muted-foreground">
                      {r.customer_notes ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.status === "pending" ? (
                        <button
                          onClick={() => setActive(r)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-sk-coral px-3 text-xs font-semibold text-white hover:bg-sk-coral-dark"
                        >
                          <Scissors className="h-4 w-4" /> Schedule
                        </button>
                      ) : r.grooming_booking_id ? (
                        <Link
                          to={`/admin/bookings/${r.grooming_booking_id}`}
                          className="text-xs font-medium text-sk-coral-dark hover:underline"
                        >
                          View groom
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {active && (
        <ScheduleHotelGroomDialog
          tenantId={tenantId}
          request={{ ...active, petLabel: active.pet?.name ?? active.pet_name }}
          open
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
