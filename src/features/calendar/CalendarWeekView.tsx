import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addDays, addMonths, addWeeks, endOfDay, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, MessageSquare, AlertTriangle } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import {
  useBookingsByRange, useResources,
  type BookingListRow, type BookingStatus, type ServiceType, type ResourceType,
} from "@/features/bookings/queries";
import { BookingFormModal } from "@/features/bookings/BookingFormModal";
import { BookingDetailPanel } from "@/features/bookings/BookingDetailPanel";
import { BookingStatusDot } from "@/features/bookings/statusMeta";

type ViewMode = "day" | "week" | "month";
type DayLayout = "time" | "resource";

const SERVICE_FILTERS: { key: string; label: string; types: ServiceType[] }[] = [
  { key: "all", label: "All", types: [] },
  { key: "daycare", label: "Daycare", types: ["daycare", "daycare_assessment"] },
  { key: "grooming_inhouse", label: "Grooming", types: ["grooming_inhouse"] },
  { key: "grooming_mobile", label: "Mobile Grooming", types: ["grooming_mobile"] },
  { key: "hotel", label: "Hotel", types: ["hotel_dog"] },
  { key: "cattery", label: "Cattery", types: ["hotel_cat"] },
  { key: "pickup", label: "Pick Up / Drop Off", types: ["pickup_dropoff"] },
];

const STATUS_FILTERS: { value: BookingStatus; label: string }[] = [
  { value: "confirmed", label: "Confirmed" },
  { value: "checked_in", label: "Checked in" },
  { value: "in_progress", label: "In progress" },
  { value: "ready", label: "Ready" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No show" },
];

const SERVICE_TONE: Record<ServiceType, string> = {
  daycare:            "bg-sk-green-soft border-sk-green text-sk-green",
  daycare_assessment: "bg-sk-green-soft border-sk-green text-sk-green",
  grooming_inhouse:   "bg-sk-coral-soft border-sk-coral text-sk-coral-dark",
  grooming_mobile:    "bg-sk-turquoise-soft border-sk-turquoise text-sk-turquoise-dark",
  hotel_dog:          "bg-sk-orange-soft border-sk-orange text-sk-orange",
  hotel_cat:          "bg-muted border-muted-foreground/40 text-foreground",
  pickup_dropoff:     "bg-slate-100 border-slate-400 text-slate-700",
};

const HOUR_START = 7;
const HOUR_END = 19;
const ROW_H = 56;

function hoursRange() {
  return Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
}

/** Vertical pixel offset from grid top for a given time on `dayAnchor`. */
function offsetFor(when: Date, dayAnchor: Date) {
  const dayStart = new Date(dayAnchor);
  dayStart.setHours(HOUR_START, 0, 0, 0);
  const mins = (when.getTime() - dayStart.getTime()) / 60000;
  return (mins / 60) * ROW_H;
}

/** Position + height for an event, clamped inside the visible grid. */
function positionFor(start: Date, end: Date, dayAnchor: Date) {
  const top = Math.max(0, offsetFor(start, dayAnchor));
  const rawH = offsetFor(end, dayAnchor) - offsetFor(start, dayAnchor);
  // gap = 4px total (2 top + 2 bottom); ensures a 60-min slot lands exactly inside its row.
  const height = Math.max(20, rawH - 4);
  return { top, height };
}

/** Whether `d` is within the visible hours (used for now-line). */
function isNowInRange(d: Date) {
  const h = d.getHours() + d.getMinutes() / 60;
  return h >= HOUR_START && h <= HOUR_END + 0.99;
}

/** Live-updating "now" (ticks every 60s). */
function useNow() {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function NowLine({ dayAnchor }: { dayAnchor: Date }) {
  const now = useNow();
  if (!isSameDay(now, dayAnchor) || !isNowInRange(now)) return null;
  const top = offsetFor(now, dayAnchor);
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
      style={{ top: top - 1 }}
    >
      <span className="-ml-1 h-2 w-2 rounded-full bg-sk-coral shadow" />
      <span className="h-[2px] flex-1 bg-sk-coral" />
    </div>
  );
}

function EventCard({ b, onClick, height, hideResource = false }: { b: BookingListRow; onClick: () => void; height?: number; hideResource?: boolean }) {
  const pet = b.booking_pets[0]?.pet;
  const warn = !b.resource_id;
  const compact = typeof height === "number" && height < 46;
  return (
    <button
      onClick={onClick}
      className={
        "block h-full w-full overflow-hidden rounded-lg border-l-[3px] px-2 py-0.5 text-left text-[11px] shadow-sm hover:shadow-md transition-all " +
        SERVICE_TONE[b.service_type]
      }
    >
      <div className="flex items-center justify-between gap-1 leading-[1.15]">
        <span className="tabular-nums font-semibold">
          {b.start_at ? format(new Date(b.start_at), "HH:mm") : ""}
        </span>
        <span className="flex items-center gap-0.5">
          {warn && <AlertTriangle className="h-3 w-3 opacity-70" />}
          {b.notes_internal && <MessageSquare className="h-3 w-3 opacity-70" />}
          <BookingStatusDot status={b.status} />
        </span>
      </div>
      <div className="truncate text-[11px] font-semibold leading-[1.15]">
        {pet?.name ?? "—"}{b.booking_pets.length > 1 ? ` +${b.booking_pets.length - 1}` : ""}
      </div>
      {!compact && (
        <div className="truncate text-[10px] leading-[1.15] opacity-80">{b.customer?.full_name ?? "—"}</div>
      )}
      {!compact && !hideResource && b.resource?.name && (
        <div className="truncate text-[10px] leading-[1.15] opacity-70">{b.resource.name}</div>
      )}
    </button>
  );
}

export default function CalendarWeekView() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<ViewMode>("week");
  const [dayLayout, setDayLayout] = useState<DayLayout>("resource");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [serviceKey, setServiceKey] = useState<string>("all");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<BookingStatus>>(new Set());
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set());
  const [showNew, setShowNew] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const resourcesQ = useResources(tenantId);

  // Handle deep-link from booking requests: /admin/calendar?newBooking=1&customer=...&service=...
  useEffect(() => {
    if (searchParams.get("newBooking") === "1") {
      setShowNew(true);
    }
  }, [searchParams]);

  const prefill = useMemo(() => {
    if (!showNew || searchParams.get("newBooking") !== "1") return undefined;
    return {
      customer_id: searchParams.get("customer") ?? undefined,
      pet_ids: searchParams.get("pet") ? [searchParams.get("pet") as string] : undefined,
      service_type: (searchParams.get("service") as ServiceType) ?? undefined,
      start_at: searchParams.get("start") ?? undefined,
      booking_request_id: searchParams.get("request") ?? undefined,
    };
  }, [showNew, searchParams]);

  const range = useMemo(() => {
    if (view === "day") return { from: startOfDay(anchor), to: endOfDay(anchor) };
    if (view === "week") {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      return { from: s, to: endOfWeek(anchor, { weekStartsOn: 1 }) };
    }
    const s = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    const e = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
    return { from: s, to: e };
  }, [view, anchor]);

  const serviceTypes = SERVICE_FILTERS.find((f) => f.key === serviceKey)?.types ?? [];

  const bookingsQ = useBookingsByRange({
    tenantId,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    serviceTypes: serviceTypes.length ? serviceTypes : undefined,
    resourceIds: selectedResources.size ? Array.from(selectedResources) : undefined,
    statuses: selectedStatuses.size ? Array.from(selectedStatuses) : undefined,
  });

  const bookings = bookingsQ.data ?? [];
  const selectedBooking = bookings.find((b) => b.id === detailId) ?? null;

  function shift(dir: 1 | -1) {
    setAnchor((a) => (view === "day" ? addDays(a, dir) : view === "week" ? addWeeks(a, dir) : addMonths(a, dir)));
  }

  function toggleStatus(s: BookingStatus) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }
  function toggleResource(id: string) {
    setSelectedResources((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const rangeLabel =
    view === "day"
      ? format(anchor, "EEEE d MMMM yyyy")
      : view === "week"
        ? `${format(range.from, "d MMM")} – ${format(addDays(range.from, 6), "d MMM yyyy")}`
        : format(anchor, "MMMM yyyy");

  return (
    <>
      <AppHeader
        title="Calendar"
        subtitle="Operations command centre — bookings across every service"
        actions={
          <>
            <div className="inline-flex overflow-hidden rounded-xl border border-border bg-white">
              {(["day", "week", "month"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={
                    "px-3 py-1.5 text-sm font-medium capitalize " +
                    (view === v ? "bg-sk-coral text-white" : "text-muted-foreground hover:bg-muted")
                  }
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark"
            >
              <Plus className="h-4 w-4" /> New booking
            </button>
          </>
        }
      />

      <div className="flex-1 space-y-4 p-6">
        {/* Filter bar */}
        <div className="sk-card space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <button onClick={() => shift(-1)} className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => shift(1)} className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted">
                <ChevronRight className="h-4 w-4" />
              </button>
              <button onClick={() => setAnchor(new Date())} className="ml-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
                Today
              </button>
              <div className="ml-3 flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                {rangeLabel}
              </div>
              <input
                type="date"
                value={format(anchor, "yyyy-MM-dd")}
                onChange={(e) => e.target.value && setAnchor(new Date(e.target.value))}
                className="ml-2 h-8 rounded-lg border border-border bg-white px-2 text-sm outline-none"
              />
            </div>
            {view === "day" && (
              <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-border bg-white">
                {(["time", "resource"] as DayLayout[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setDayLayout(l)}
                    className={"px-3 py-1 text-xs font-medium capitalize " + (dayLayout === l ? "bg-sk-turquoise text-white" : "text-muted-foreground hover:bg-muted")}
                  >
                    {l} view
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Service pills */}
          <div className="flex flex-wrap gap-1.5">
            {SERVICE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setServiceKey(f.key)}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium " +
                  (serviceKey === f.key ? "border-sk-coral bg-sk-coral text-white" : "border-border bg-white text-foreground hover:bg-muted")
                }
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Resource pills */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Resources:</span>
            {(resourcesQ.data ?? []).map((r) => (
              <button
                key={r.id}
                onClick={() => toggleResource(r.id)}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium " +
                  (selectedResources.has(r.id) ? "border-sk-turquoise bg-sk-turquoise text-white" : "border-border bg-white text-foreground hover:bg-muted")
                }
              >
                {r.name}
              </button>
            ))}
          </div>

          {/* Status pills */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Status:</span>
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                onClick={() => toggleStatus(s.value)}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium " +
                  (selectedStatuses.has(s.value) ? "border-sk-coral-dark bg-sk-coral-dark text-white" : "border-border bg-white text-foreground hover:bg-muted")
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar body */}
        <div className="sk-card overflow-hidden">
          {bookingsQ.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading bookings…</div>}
          {bookingsQ.isError && (
            <div className="p-6 text-sm text-destructive">Failed to load bookings.</div>
          )}

          {!bookingsQ.isLoading && !bookingsQ.isError && bookings.length === 0 && (
            <EmptyState onNew={() => setShowNew(true)} />
          )}

          {!bookingsQ.isLoading && bookings.length > 0 && view === "day" && dayLayout === "resource" && (
            <ResourceDayView bookings={bookings} anchor={anchor} resources={resourcesQ.data ?? []} onSelect={setDetailId} />
          )}
          {!bookingsQ.isLoading && bookings.length > 0 && view === "day" && dayLayout === "time" && (
            <TimeDayView bookings={bookings} anchor={anchor} onSelect={setDetailId} />
          )}
          {!bookingsQ.isLoading && bookings.length > 0 && view === "week" && (
            <WeekView bookings={bookings} anchor={range.from} onSelect={setDetailId} />
          )}
          {!bookingsQ.isLoading && bookings.length > 0 && view === "month" && (
            <MonthView bookings={bookings} anchor={anchor} rangeStart={range.from} onSelect={setDetailId} />
          )}
        </div>
      </div>

      {showNew && tenantId && (
        <BookingFormModal
          tenantId={tenantId}
          prefill={prefill}
          onClose={() => {
            setShowNew(false);
            // clear query params
            if (searchParams.get("newBooking")) {
              const next = new URLSearchParams(searchParams);
              ["newBooking", "customer", "pet", "service", "start", "request"].forEach((k) => next.delete(k));
              setSearchParams(next, { replace: true });
            }
          }}
          onSaved={(id) => setDetailId(id)}
        />
      )}

      {selectedBooking && tenantId && (
        <BookingDetailPanel
          tenantId={tenantId}
          booking={selectedBooking}
          onClose={() => setDetailId(null)}
        />
      )}
    </>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <CalendarDays className="h-10 w-10 text-muted-foreground" />
      <div className="text-lg font-semibold">No bookings in this date range</div>
      <div className="text-sm text-muted-foreground">Create a new booking or review booking requests.</div>
      <div className="mt-2 flex gap-2">
        <button onClick={onNew} className="inline-flex items-center gap-2 rounded-xl bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark">
          <Plus className="h-4 w-4" /> New booking
        </button>
        <a href="/admin/booking-requests" className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
          View booking requests
        </a>
      </div>
    </div>
  );
}

function TimeDayView({ bookings, anchor, onSelect }: { bookings: BookingListRow[]; anchor: Date; onSelect: (id: string) => void }) {
  const hours = hoursRange();
  const dayBookings = bookings.filter((b) => b.start_at && isSameDay(new Date(b.start_at), anchor));
  return (
    <div className="relative grid grid-cols-[64px_minmax(0,1fr)]">
      <div>
        {hours.map((h) => (
          <div key={h} className="h-14 pr-2 pt-1 text-right text-[11px] text-muted-foreground">
            {String(h).padStart(2, "0")}:00
          </div>
        ))}
      </div>
      <div className="relative border-l border-border">
        {hours.map((h) => <div key={h} className="h-14 border-b border-border/60" />)}
        <NowLine dayAnchor={anchor} />
        {dayBookings.map((b) => {
          const s = new Date(b.start_at!);
          const e = b.end_at ? new Date(b.end_at) : new Date(s.getTime() + 60 * 60 * 1000);
          const { top, height } = positionFor(s, e, anchor);
          return (
            <div key={b.id} className="absolute left-1 right-1 z-10" style={{ top: top + 2, height }}>
              <EventCard b={b} onClick={() => onSelect(b.id)} height={height} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResourceDayView({
  bookings, anchor, resources, onSelect,
}: {
  bookings: BookingListRow[]; anchor: Date;
  resources: { id: string; name: string; type: ResourceType }[];
  onSelect: (id: string) => void;
}) {
  const hours = hoursRange();
  const cols = [...resources, { id: "__unassigned", name: "Unassigned", type: "inhouse_grooming" as ResourceType }];
  const dayBookings = bookings.filter((b) => b.start_at && isSameDay(new Date(b.start_at), anchor));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">
        <div
          className="grid border-b border-border bg-sk-surface-muted"
          style={{ gridTemplateColumns: `64px repeat(${cols.length}, minmax(140px, 1fr))` }}
        >
          <div />
          {cols.map((c) => (
            <div key={c.id} className="border-l border-border px-2 py-2 text-xs font-semibold">
              {c.name}
            </div>
          ))}
        </div>
        <div className="relative grid" style={{ gridTemplateColumns: `64px repeat(${cols.length}, minmax(140px, 1fr))` }}>
          <div>
            {hours.map((h) => (
              <div key={h} className="h-14 pr-2 pt-1 text-right text-[11px] text-muted-foreground">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {cols.map((c) => {
            const colBookings = dayBookings.filter((b) =>
              c.id === "__unassigned" ? !b.resource_id : b.resource_id === c.id,
            );
            return (
              <div key={c.id} className="relative border-l border-border">
                {hours.map((h) => <div key={h} className="h-14 border-b border-border/60" />)}
                <NowLine dayAnchor={anchor} />
                {colBookings.map((b) => {
                  const s = new Date(b.start_at!);
                  const e = b.end_at ? new Date(b.end_at) : new Date(s.getTime() + 60 * 60 * 1000);
                  const { top, height } = positionFor(s, e, anchor);
                  return (
                    <div key={b.id} className="absolute left-1 right-1 z-10" style={{ top: top + 2, height }}>
                      <EventCard b={b} onClick={() => onSelect(b.id)} height={height} hideResource />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekView({ bookings, anchor, onSelect }: { bookings: BookingListRow[]; anchor: Date; onSelect: (id: string) => void }) {
  const hours = hoursRange();
  const days = Array.from({ length: 7 }, (_, i) => addDays(anchor, i));
  return (
    <div>
      <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-border">
        <div />
        {days.map((d, i) => {
          const today = isSameDay(d, new Date());
          return (
            <div key={i} className="border-l border-border px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{format(d, "EEE")}</div>
              <div className={"mt-0.5 text-lg font-semibold " + (today ? "text-sk-coral-dark" : "")}>{format(d, "d")}</div>
            </div>
          );
        })}
      </div>
      <div className="relative grid grid-cols-[64px_repeat(7,minmax(0,1fr))]">
        <div>
          {hours.map((h) => (
            <div key={h} className="h-14 pr-2 pt-1 text-right text-[11px] text-muted-foreground">
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {days.map((d, i) => {
          const dayBookings = bookings.filter((b) => b.start_at && isSameDay(new Date(b.start_at), d));
          return (
            <div key={i} className="relative border-l border-border">
              {hours.map((h) => <div key={h} className="h-14 border-b border-border/60" />)}
              <NowLine dayAnchor={d} />
              {dayBookings.map((b) => {
                const s = new Date(b.start_at!);
                const e = b.end_at ? new Date(b.end_at) : new Date(s.getTime() + 60 * 60 * 1000);
                const { top, height } = positionFor(s, e, d);
                return (
                  <div key={b.id} className="absolute left-1 right-1 z-10" style={{ top: top + 2, height }}>
                    <EventCard b={b} onClick={() => onSelect(b.id)} height={height} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({
  bookings, anchor, rangeStart, onSelect,
}: { bookings: BookingListRow[]; anchor: Date; rangeStart: Date; onSelect: (id: string) => void }) {
  const cells = Array.from({ length: 42 }, (_, i) => addDays(rangeStart, i));
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border bg-sk-surface-muted">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-3 py-2 text-xs font-semibold text-muted-foreground">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const dim = !isSameMonth(d, anchor);
          const today = isSameDay(d, new Date());
          const dayBookings = bookings.filter((b) => b.start_at && isSameDay(new Date(b.start_at), d));
          return (
            <div key={i} className={"min-h-[120px] border-b border-l border-border p-1.5 " + (dim ? "bg-sk-surface-muted/40" : "")}>
              <div className={"mb-1 text-xs " + (today ? "font-semibold text-sk-coral-dark" : "text-muted-foreground")}>
                {format(d, "d")}
              </div>
              <div className="space-y-1">
                {dayBookings.slice(0, 3).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onSelect(b.id)}
                    className={"block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] border-l-[3px] " + SERVICE_TONE[b.service_type]}
                  >
                    <span className="tabular-nums font-semibold">{format(new Date(b.start_at!), "HH:mm")}</span>{" "}
                    {b.booking_pets[0]?.pet?.name ?? b.customer?.full_name ?? "—"}
                  </button>
                ))}
                {dayBookings.length > 3 && (
                  <div className="pl-1 text-[10px] text-muted-foreground">+{dayBookings.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}