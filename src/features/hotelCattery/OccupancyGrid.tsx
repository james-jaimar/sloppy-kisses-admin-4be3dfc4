import { Link } from "react-router-dom";
import { toast } from "sonner";
import { BOOKING_STATUS_META } from "@/features/bookings/statusMeta";
import {
  useAssignBookingResource,
  type HotelBookingRow,
  type HotelQuoteRow,
  type HotelResourceRow,
} from "./queries";

function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function startOfDay(d: Date) { const c = new Date(d); c.setHours(0,0,0,0); return c; }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtColHeader(d: Date) {
  return { dow: d.toLocaleDateString("en-ZA", { weekday: "short" }), dom: d.getDate() };
}

/** Statuses that hold a space provisionally rather than firmly. */
const HELD_STATUSES = new Set(["pending_payment", "requested", "draft", "needs_info"]);
const DEAD_STATUSES = new Set(["cancelled", "no_show"]);

export function isHeldBooking(b: { status: string }) {
  return HELD_STATUSES.has(b.status);
}
export function isFirmBooking(b: { status: string }) {
  return !HELD_STATUSES.has(b.status) && !DEAD_STATUSES.has(b.status);
}

function holdLeft(iso: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  return h >= 24 ? `${Math.floor(h / 24)}d left` : `${Math.max(1, h)}h left`;
}

/** Map booking.status to a background class for the occupancy bar. */
function barClass(status: string) {
  const meta = (BOOKING_STATUS_META as any)[status];
  // Reuse the chip colours but flatten padding. Fallback to muted grey.
  return meta?.chip ?? "bg-muted text-muted-foreground border-border";
}

export interface OccupancyGridProps {
  tenantId: string | null;
  resources: HotelResourceRow[];
  bookings: HotelBookingRow[];
  quotes?: HotelQuoteRow[];
  windowStart: Date;
  windowDays: number;
  loading: boolean;
}


const LANE_H = 34;      // px per pet lane
const LANE_GAP = 4;
const ROW_PAD = 8;

interface Segment {
  key: string;
  booking: HotelBookingRow;
  petName: string;
  startMs: number;
  endMs: number;
  lane: number;
}

/** One bar per pet, laid out into non-overlapping lanes. */
function buildSegments(bookings: HotelBookingRow[], windowStart: Date, windowEnd: Date): { segments: Segment[]; lanes: number } {
  const raw: Omit<Segment, "lane">[] = [];
  for (const b of bookings) {
    const start = new Date(b.start_at);
    const end = b.end_at ? new Date(b.end_at) : windowEnd;
    const startMs = Math.max(start.getTime(), windowStart.getTime());
    const endMs = Math.min(end.getTime(), windowEnd.getTime());
    if (endMs <= startMs) continue;
    const pets = b.pets.length ? b.pets : [{ id: "none", name: "Pet", species: null, breed: null } as any];
    for (const p of pets) {
      raw.push({ key: `${b.id}:${p.id}`, booking: b, petName: p.name ?? "Unnamed pet", startMs, endMs });
    }
  }
  raw.sort((a, z) => a.startMs - z.startMs || a.petName.localeCompare(z.petName));
  const laneEnds: number[] = [];
  const segments: Segment[] = raw.map((s) => {
    let lane = laneEnds.findIndex((endMs) => endMs <= s.startMs);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(s.endMs); }
    else laneEnds[lane] = s.endMs;
    return { ...s, lane };
  });
  return { segments, lanes: Math.max(laneEnds.length, 1) };
}

/** Pets occupying a resource on a given day (day counts a night that starts on that date). */
function usedOnDay(bookings: HotelBookingRow[], day: Date) {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();
  let n = 0;
  for (const b of bookings) {
    if (!isFirmBooking(b)) continue;
    const s = new Date(b.start_at).getTime();
    const e = b.end_at ? new Date(b.end_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (s < dayEnd && e > dayStart) n += Math.max(1, b.pets.length);
  }
  return n;
}

/** Pets provisionally holding a space on a given day (unpaid / requested bookings). */
function heldOnDay(bookings: HotelBookingRow[], day: Date) {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();
  let n = 0;
  for (const b of bookings) {
    if (!isHeldBooking(b)) continue;
    const s = new Date(b.start_at).getTime();
    const e = b.end_at ? new Date(b.end_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (s < dayEnd && e > dayStart) n += Math.max(1, b.pets.length);
  }
  return n;
}

function quotesOnDay(quotes: HotelQuoteRow[], day: Date) {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();
  let n = 0;
  for (const q of quotes) {
    const s = new Date(q.start_at).getTime();
    const e = q.end_at ? new Date(q.end_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (s < dayEnd && e > dayStart) n += Math.max(1, q.petNames.length);
  }
  return n;
}

function countTone(used: number, capacity: number | null) {
  if (capacity == null) return used > 0 ? "text-foreground" : "text-muted-foreground";
  if (used > capacity) return "bg-destructive/10 text-destructive font-semibold";
  if (used === capacity) return "bg-sk-orange-soft text-sk-orange font-semibold";
  if (used >= capacity * 0.8) return "text-sk-orange font-medium";
  return used > 0 ? "text-foreground" : "text-muted-foreground";
}

export function OccupancyGrid({ tenantId, resources, bookings, quotes = [], windowStart, windowDays, loading }: OccupancyGridProps) {
  const days = Array.from({ length: windowDays }, (_, i) => addDays(windowStart, i));
  const today = startOfDay(new Date());

  const unassigned = bookings.filter((b) => !b.resource_id);
  const rows: (HotelResourceRow | { id: "__unassigned"; name: string; type: null; capacity: null; sort_order: number })[] = [
    ...resources,
  ];
  if (unassigned.length) {
    rows.push({ id: "__unassigned", name: "Unassigned", type: null, capacity: null, sort_order: 9999 } as any);
  }

  const totalCapacity = resources.reduce((s, r) => s + (r.capacity ?? 0), 0);
  const anyCapacity = resources.some((r) => r.capacity != null);
  const assignedBookings = bookings.filter((b) => b.resource_id);
  const peak = days.reduce((max, d) => Math.max(max, usedOnDay(assignedBookings, d)), 0);
  const peakHeld = days.reduce(
    (max, d) => Math.max(max, heldOnDay(bookings, d) + quotesOnDay(quotes, d)),
    0,
  );

  return (
    <div className="sk-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">Occupancy</h2>
          <p className="text-xs text-muted-foreground">
            {resources.length} {resources.length === 1 ? "area" : "areas"}
            {anyCapacity ? ` · ${totalCapacity} spaces` : " · no space limits set"}
            {" · "}peak {peak} {peak === 1 ? "pet" : "pets"} confirmed
            {peakHeld > 0 ? ` · +${peakHeld} held` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded border border-sk-green bg-sk-green-soft" /> Confirmed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded border border-dashed border-sk-orange bg-sk-orange-soft" /> Held / unpaid
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded border border-dashed border-border bg-muted" /> Quote
          </span>
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
                assign={
                  r.id === "__unassigned" && tenantId
                    ? { tenantId, resources, allBookings: bookings, today }
                    : undefined
                }
              />
            ))}

            {quotes.length > 0 && (
              <QuotesRow
                quotes={quotes}
                days={days}
                windowStart={windowStart}
                windowEnd={addDays(windowStart, windowDays)}
              />
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function ResourceRow({
  resource, days, windowStart, windowEnd, bookings, assign,
}: {
  resource: { id: string; name: string; capacity: number | null };
  days: Date[];
  windowStart: Date;
  windowEnd: Date;
  bookings: HotelBookingRow[];
  assign?: { tenantId: string; resources: HotelResourceRow[]; allBookings: HotelBookingRow[]; today: Date };
}) {
  const today = startOfDay(new Date());
  const { segments, lanes } = buildSegments(bookings, windowStart, windowEnd);
  const bodyHeight = lanes * LANE_H + (lanes - 1) * LANE_GAP + ROW_PAD * 2;
  const usedToday = usedOnDay(bookings, today);
  const capacity = resource.capacity;

  return (
    <div className="border-b border-border">
      {/* Lane band */}
      <div className="relative grid" style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(70px, 1fr))` }}>
        <div className="px-3 py-3 text-sm">
          <div className="font-medium truncate">{resource.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {capacity != null ? `${usedToday}/${capacity} today` : "No space limit set"}
          </div>
        </div>
        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={`border-l border-border ${isToday ? "bg-sk-coral-soft/30" : ""}`}
              style={{ minHeight: bodyHeight }}
            />
          );
        })}

        {/* Overlay pet bars, one lane each */}
        <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(70px, 1fr))` }}>
          <div />
          <div className="relative" style={{ gridColumn: `2 / span ${days.length}` }}>
            {segments.map((seg) => {
              const totalMs = windowEnd.getTime() - windowStart.getTime();
              const leftPct = ((seg.startMs - windowStart.getTime()) / totalMs) * 100;
              const widthPct = Math.max(((seg.endMs - seg.startMs) / totalMs) * 100, 100 / days.length / 3);
              const b = seg.booking;
              const held = isHeldBooking(b);
              const cls = barClass(b.status);
              return (
                <Link
                  key={seg.key}
                  to={`/admin/bookings/${b.id}`}
                  state={{ from: "/admin/hotel-cattery" }}
                  className={`pointer-events-auto absolute flex items-center gap-1.5 truncate rounded-md border px-2 text-xs font-medium shadow-sm transition hover:translate-y-[-1px] hover:shadow-md ${cls} ${held ? "border-dashed opacity-90" : ""}`}

                  style={{
                    top: ROW_PAD + seg.lane * (LANE_H + LANE_GAP),
                    height: LANE_H,
                    left: `${leftPct}%`,
                    width: `calc(${widthPct}% - 4px)`,
                  }}
                  title={`${b.booking_number} · ${seg.petName} (${b.customer?.full_name ?? "—"}) · ${new Date(b.start_at).toLocaleDateString()}${b.end_at ? " → " + new Date(b.end_at).toLocaleDateString() : ""}`}
                >
                  <span className="truncate">{seg.petName}</span>
                  <span className="truncate text-[10px] opacity-80">{b.customer?.full_name ?? ""}</span>
                  <span className="ml-auto shrink-0 text-[10px] opacity-70">{b.booking_number}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Per-day occupancy counts */}
      <div className="grid border-t border-dashed border-border" style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(70px, 1fr))` }}>
        <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground">Occupancy</div>
        {days.map((d) => {
          const used = usedOnDay(bookings, d);
          const held = heldOnDay(bookings, d);
          return (
            <div
              key={d.toISOString()}
              className={`border-l border-border px-1 py-1 text-center text-[11px] tabular-nums ${countTone(used, capacity)}`}
              title={
                (capacity != null ? `${used} of ${capacity} spaces confirmed` : `${used} pets confirmed`) +
                (held ? ` · ${held} held (unpaid / requested)` : "")
              }
            >
              {capacity != null ? `${used}/${capacity}` : used || "—"}
              {held > 0 && <span className="ml-0.5 text-sk-orange">+{held}</span>}
            </div>
          );
        })}

      </div>

      {assign && bookings.length > 0 && (
        <AssignPanel
          tenantId={assign.tenantId}
          resources={assign.resources}
          allBookings={assign.allBookings}
          today={assign.today}
          bookings={bookings}
        />
      )}
    </div>
  );
}

/** Pencilled quotes: dates a customer is holding but hasn't converted into a booking. */
function QuotesRow({
  quotes, days, windowStart, windowEnd,
}: {
  quotes: HotelQuoteRow[];
  days: Date[];
  windowStart: Date;
  windowEnd: Date;
}) {
  const today = startOfDay(new Date());
  type QSeg = { key: string; quote: HotelQuoteRow; petName: string; startMs: number; endMs: number; lane: number };
  const raw: Omit<QSeg, "lane">[] = [];
  for (const q of quotes) {
    const startMs = Math.max(new Date(q.start_at).getTime(), windowStart.getTime());
    const endMs = Math.min(
      q.end_at ? new Date(q.end_at).getTime() : windowEnd.getTime(),
      windowEnd.getTime(),
    );
    if (endMs <= startMs) continue;
    const names = q.petNames.length ? q.petNames : ["Pet"];
    names.forEach((petName, i) => raw.push({ key: `${q.id}:${i}`, quote: q, petName, startMs, endMs }));
  }
  raw.sort((a, z) => a.startMs - z.startMs);
  const laneEnds: number[] = [];
  const segments: QSeg[] = raw.map((s) => {
    let lane = laneEnds.findIndex((e) => e <= s.startMs);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(s.endMs); }
    else laneEnds[lane] = s.endMs;
    return { ...s, lane };
  });
  const lanes = Math.max(laneEnds.length, 1);
  const bodyHeight = lanes * LANE_H + (lanes - 1) * LANE_GAP + ROW_PAD * 2;
  const totalMs = windowEnd.getTime() - windowStart.getTime();

  return (
    <div className="border-b border-border bg-sk-surface-muted/40">
      <div className="relative grid" style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(70px, 1fr))` }}>
        <div className="px-3 py-3 text-sm">
          <div className="truncate font-medium">Pencilled quotes</div>
          <div className="text-[11px] text-muted-foreground">Dates held, not booked</div>
        </div>
        {days.map((d) => (
          <div
            key={d.toISOString()}
            className={`border-l border-border ${sameDay(d, today) ? "bg-sk-coral-soft/30" : ""}`}
            style={{ minHeight: bodyHeight }}
          />
        ))}

        <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(70px, 1fr))` }}>
          <div />
          <div className="relative" style={{ gridColumn: `2 / span ${days.length}` }}>
            {segments.map((seg) => {
              const leftPct = ((seg.startMs - windowStart.getTime()) / totalMs) * 100;
              const widthPct = Math.max(((seg.endMs - seg.startMs) / totalMs) * 100, 100 / days.length / 3);
              const q = seg.quote;
              const left = holdLeft(q.hold_expires_at);
              return (
                <Link
                  key={seg.key}
                  to={`/admin/quotes/${q.id}`}
                  className="pointer-events-auto absolute flex items-center gap-1.5 truncate rounded-md border border-dashed border-border bg-background/80 px-2 text-xs font-medium text-muted-foreground shadow-sm transition hover:translate-y-[-1px] hover:shadow-md"
                  style={{
                    top: ROW_PAD + seg.lane * (LANE_H + LANE_GAP),
                    height: LANE_H,
                    left: `${leftPct}%`,
                    width: `calc(${widthPct}% - 4px)`,
                  }}
                  title={`${q.estimate_number} · ${seg.petName} (${q.customer?.full_name ?? "—"})${
                    q.total != null ? ` · R${q.total.toFixed(2)}` : ""
                  }${left ? ` · hold ${left}` : ""}`}
                >
                  <span className="truncate">{seg.petName}</span>
                  <span className="truncate text-[10px] opacity-80">{q.customer?.full_name ?? ""}</span>
                  {left && (
                    <span className="shrink-0 rounded bg-sk-orange-soft px-1 text-[10px] font-semibold text-sk-orange">
                      {left}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[10px] opacity-70">{q.estimate_number}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid border-t border-dashed border-border" style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(70px, 1fr))` }}>
        <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground">Quoted pets</div>
        {days.map((d) => {
          const n = quotesOnDay(quotes, d);
          return (
            <div
              key={d.toISOString()}
              className={`border-l border-border px-1 py-1 text-center text-[11px] tabular-nums ${n ? "text-sk-orange font-medium" : "text-muted-foreground"}`}
            >
              {n || "—"}
            </div>
          );
        })}
      </div>
    </div>
  );
}



/** Quick "put this stay in an area" control for unassigned hotel/cattery bookings. */
function AssignPanel({
  tenantId, resources, allBookings, today, bookings,
}: {
  tenantId: string;
  resources: HotelResourceRow[];
  allBookings: HotelBookingRow[];
  today: Date;
  bookings: HotelBookingRow[];
}) {
  const assignM = useAssignBookingResource(tenantId);

  return (
    <div className="border-t border-border bg-sk-surface-muted/60 px-3 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Assign an area
      </div>
      <div className="space-y-2">
        {bookings.map((b) => {
          const wanted = b.service_type === "hotel_cat" ? "cattery_area" : "hotel_area";
          const options = resources.filter((r) => r.type === wanted);
          const petNames = b.pets.map((p) => p.name ?? "Unnamed pet").join(", ") || "Pet";
          return (
            <div key={b.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">{petNames}</span>
              <span className="text-muted-foreground">{b.customer?.full_name ?? "—"}</span>
              <span className="text-muted-foreground">{b.booking_number}</span>
              <select
                className="ml-auto rounded-lg border border-border bg-background px-2 py-1 text-xs"
                defaultValue=""
                disabled={assignM.isPending || !options.length}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  const target = options.find((o) => o.id === id);
                  const used = usedOnDay(allBookings.filter((x) => x.resource_id === id), today);
                  if (target?.capacity != null && used + Math.max(1, b.pets.length) > target.capacity) {
                    const ok = window.confirm(
                      `${target.name} is at ${used}/${target.capacity} today. Assign anyway?`,
                    );
                    if (!ok) { e.target.value = ""; return; }
                  }
                  assignM.mutate(
                    { bookingId: b.id, resourceId: id },
                    {
                      onSuccess: () => toast.success(`${b.booking_number} moved to ${target?.name ?? "area"}`),
                      onError: (err: any) => toast.error(err?.message ?? "Could not assign the area"),
                    },
                  );
                }}
              >
                <option value="">{options.length ? "Choose area…" : "No areas set up"}</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.capacity != null
                      ? ` (${usedOnDay(allBookings.filter((x) => x.resource_id === o.id), today)}/${o.capacity} today)`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}