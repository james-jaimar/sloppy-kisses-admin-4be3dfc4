import { Link } from "react-router-dom";
import { BOOKING_STATUS_META } from "@/features/bookings/statusMeta";
import type { HotelBookingRow, HotelResourceRow } from "./queries";

function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function startOfDay(d: Date) { const c = new Date(d); c.setHours(0,0,0,0); return c; }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtColHeader(d: Date) {
  return { dow: d.toLocaleDateString("en-ZA", { weekday: "short" }), dom: d.getDate() };
}

/** Map booking.status to a background class for the occupancy bar. */
function barClass(status: string) {
  const meta = (BOOKING_STATUS_META as any)[status];
  // Reuse the chip colours but flatten padding. Fallback to muted grey.
  return meta?.chip ?? "bg-muted text-muted-foreground border-border";
}

export interface OccupancyGridProps {
  resources: HotelResourceRow[];
  bookings: HotelBookingRow[];
  windowStart: Date;
  windowDays: number;
  loading: boolean;
}

export function OccupancyGrid({ resources, bookings, windowStart, windowDays, loading }: OccupancyGridProps) {
  const days = Array.from({ length: windowDays }, (_, i) => addDays(windowStart, i));
  const today = startOfDay(new Date());

  const unassigned = bookings.filter((b) => !b.resource_id);
  const rows: (HotelResourceRow | { id: "__unassigned"; name: string; type: null; capacity: null; sort_order: number })[] = [
    ...resources,
  ];
  if (unassigned.length) {
    rows.push({ id: "__unassigned", name: "Unassigned", type: null, capacity: null, sort_order: 9999 } as any);
  }

  return (
    <div className="sk-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">Occupancy</h2>
          <p className="text-xs text-muted-foreground">
            {resources.length} {resources.length === 1 ? "resource" : "resources"} · {bookings.length} {bookings.length === 1 ? "booking" : "bookings"} in view
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : !resources.length ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          No hotel or cattery resources yet. Add one under <Link to="/admin/settings/resources" className="font-medium underline">Settings → Resources</Link>.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            {/* Header row */}
            <div className="grid" style={{ gridTemplateColumns: `180px repeat(${windowDays}, minmax(70px, 1fr))` }}>
              <div className="border-b border-border bg-sk-surface-muted px-3 py-2 text-xs font-semibold text-muted-foreground">Resource</div>
              {days.map((d) => {
                const isToday = sameDay(d, today);
                const { dow, dom } = fmtColHeader(d);
                return (
                  <div
                    key={d.toISOString()}
                    className={`border-b border-l border-border px-2 py-2 text-center text-xs ${isToday ? "bg-sk-coral-soft text-sk-coral-dark font-semibold" : "bg-sk-surface-muted text-muted-foreground"}`}
                  >
                    <div>{dow}</div>
                    <div className="text-sm text-foreground">{dom}</div>
                  </div>
                );
              })}
            </div>

            {/* Resource rows */}
            {rows.map((r) => (
              <ResourceRow
                key={r.id}
                resource={r as any}
                days={days}
                windowStart={windowStart}
                windowEnd={addDays(windowStart, windowDays)}
                bookings={
                  r.id === "__unassigned"
                    ? bookings.filter((b) => !b.resource_id)
                    : bookings.filter((b) => b.resource_id === r.id)
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResourceRow({
  resource, days, windowStart, windowEnd, bookings,
}: {
  resource: { id: string; name: string; capacity: number | null };
  days: Date[];
  windowStart: Date;
  windowEnd: Date;
  bookings: HotelBookingRow[];
}) {
  const today = startOfDay(new Date());
  return (
    <div
      className="relative grid border-b border-border"
      style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(70px, 1fr))` }}
    >
      <div className="px-3 py-3 text-sm">
        <div className="font-medium truncate">{resource.name}</div>
        {resource.capacity != null && (
          <div className="text-[11px] text-muted-foreground">Capacity {resource.capacity}</div>
        )}
      </div>
      {days.map((d) => {
        const isToday = sameDay(d, today);
        return <div key={d.toISOString()} className={`min-h-[54px] border-l border-border ${isToday ? "bg-sk-coral-soft/30" : ""}`} />;
      })}

      {/* Overlay booking bars, absolutely positioned across day columns */}
      <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(70px, 1fr))` }}>
        <div />
        <div className="relative col-span-full" style={{ gridColumn: `2 / span ${days.length}` }}>
          {bookings.map((b) => {
            const start = new Date(b.start_at);
            const end = b.end_at ? new Date(b.end_at) : windowEnd;
            const startClamped = start < windowStart ? windowStart : start;
            const endClamped = end > windowEnd ? windowEnd : end;
            const totalMs = windowEnd.getTime() - windowStart.getTime();
            const leftPct = ((startClamped.getTime() - windowStart.getTime()) / totalMs) * 100;
            const widthPct = Math.max(
              ((endClamped.getTime() - startClamped.getTime()) / totalMs) * 100,
              100 / days.length / 4,
            );
            const petName = b.pets[0]?.name ?? "Pet";
            const ownerInitial = b.customer?.full_name?.charAt(0) ?? "";
            const cls = barClass(b.status);
            return (
              <Link
                key={b.id}
                to={`/admin/bookings/${b.id}`}
                state={{ from: "/admin/hotel-cattery" }}
                className={`pointer-events-auto absolute top-1.5 h-[42px] truncate rounded-md border px-2 py-1 text-xs font-medium shadow-sm transition hover:translate-y-[-1px] hover:shadow-md ${cls}`}
                style={{ left: `${leftPct}%`, width: `calc(${widthPct}% - 4px)` }}
                title={`${b.booking_number} · ${petName} (${b.customer?.full_name ?? "—"}) · ${new Date(b.start_at).toLocaleDateString()}${b.end_at ? " → " + new Date(b.end_at).toLocaleDateString() : ""}`}
              >
                <div className="truncate">{petName}{ownerInitial ? ` · ${ownerInitial}` : ""}</div>
                <div className="truncate text-[10px] opacity-80">{b.booking_number}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}