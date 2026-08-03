import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Plus, Search, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { BookingFormModal } from "./BookingFormModal";
import { BookingStatusChip } from "./statusMeta";
import { useBookingsList, type BookingStatus, type ServiceType } from "./queries";
import { StayPlayBadge } from "@/features/daycare/StayPlayBadge";
import { useStayPlayFlags } from "@/features/daycare/stayPlayQueries";

const SERVICE_LABELS: Record<string, string> = {
  daycare: "Daycare",
  daycare_assessment: "Daycare assessment",
  hotel_dog: "Hotel — dog",
  hotel_cat: "Hotel — cat",
  grooming_inhouse: "Grooming (in-house)",
  grooming_mobile: "Grooming (mobile)",
  pickup_dropoff: "Pick up / drop-off",
};

const SERVICE_TYPES: (ServiceType | "all")[] = [
  "all",
  "daycare",
  "daycare_assessment",
  "hotel_dog",
  "hotel_cat",
  "grooming_inhouse",
  "grooming_mobile",
  "pickup_dropoff",
];

const STATUSES: (BookingStatus | "all")[] = [
  "all", "draft", "requested", "confirmed", "checked_in", "in_progress",
  "ready", "checked_out", "completed", "cancelled", "no_show",
];

const inputCls =
  "h-10 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40";

export default function BookingsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType | "all">("all");
  const [status, setStatus] = useState<BookingStatus | "all">("all");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const listQ = useBookingsList({
    tenantId,
    search: debouncedSearch,
    serviceType,
    status,
  });
  const rows = listQ.data ?? [];

  return (
    <>
      <AppHeader
        title="Bookings"
        subtitle="All bookings across services"
        actions={
          <button
            onClick={() => setOpen(true)}
            disabled={!tenantId}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            <Plus className="h-4 w-4" /> New booking
          </button>
        }
      />
      <div className="flex-1 space-y-4 p-6">
        <div className="sk-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by booking #, customer, pet…"
                className={`${inputCls} w-full pl-9`}
              />
            </div>
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value as any)} className={inputCls}>
              {SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>{s === "all" ? "All services" : SERVICE_LABELS[s] ?? s}</option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={inputCls}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s === "all" ? "All statuses" : s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="sk-card overflow-hidden">
          {listQ.isLoading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading bookings…
            </div>
          ) : listQ.isError ? (
            <div className="px-5 py-16 text-center text-sm text-sk-coral-dark">
              Failed to load bookings: {(listQ.error as any)?.message ?? "Unknown error"}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-muted-foreground">
              No bookings found.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Booking</th>
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Service</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Pets</th>
                  <th className="px-5 py-3">Resource</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((b) => {
                  const start = b.start_at ? new Date(b.start_at) : null;
                  return (
                    <tr
                      key={b.id}
                      onClick={() => navigate(`/admin/bookings/${b.id}`)}
                      className="cursor-pointer hover:bg-sk-surface-muted/40"
                    >
                      <td className="px-5 py-3 font-medium">{b.booking_number}</td>
                      <td className="px-5 py-3 tabular-nums">
                        {start ? (
                          <>
                            <div>{format(start, "d MMM yyyy")}</div>
                            <div className="text-xs text-muted-foreground">{format(start, "HH:mm")}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3">{SERVICE_LABELS[b.service_type] ?? b.service_type}</td>
                      <td className="px-5 py-3">
                        {b.customer?.full_name ?? <span className="text-muted-foreground">—</span>}
                        {b.customer?.customer_number && (
                          <div className="text-xs text-muted-foreground">{b.customer.customer_number}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {b.booking_pets.map((bp) => bp.pet?.name).filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{b.resource?.name ?? "—"}</td>
                      <td className="px-5 py-3"><BookingStatusChip status={b.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {open && tenantId && (
        <BookingFormModal
          tenantId={tenantId}
          onClose={() => setOpen(false)}
          onSaved={(id) => {
            setOpen(false);
            navigate(`/admin/bookings/${id}`);
          }}
        />
      )}
    </>
  );
}