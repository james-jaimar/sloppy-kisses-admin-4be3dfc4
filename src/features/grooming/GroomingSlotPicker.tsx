import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { isClosedDay, useGroomingDayAvailability, type GroomingPoolKind } from "./availabilityQueries";
import {
  canSeatAll,
  freeResourcesAt,
  poolHours,
  type GroomerResource,
  type PetSlotRequest,
} from "./multiPetSchedule";

function toLocalIso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function dateKeyOf(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Short lane label: "Groomer 3" -> "G3", "Mobile Van 1" -> "V1". */
function shortLabel(r: GroomerResource, idx: number) {
  const num = /(\d+)\s*$/.exec(r.name)?.[1] ?? String(idx + 1);
  const prefix = /van/i.test(r.name) ? "V" : "G";
  return `${prefix}${num}`;
}

export interface GroomingSlotPickerProps {
  tenantId: string | null | undefined;
  /** ISO local datetime string (no timezone) — the selected slot start. */
  value: string | null;
  onChange: (isoLocal: string | null, endIsoLocal: string | null) => void;
  /** Slot length in minutes — packages typically 60. Falls back to 60. */
  durationMinutes?: number;
  /** Which capacity pool to measure against. */
  kind?: GroomingPoolKind;
  /** Highlight/disable against this groomer only; otherwise any free groomer counts. */
  resourceId?: string | null;
  /** Ignore a booking id (edit-mode). */
  excludeBookingId?: string | null;
  /** Operating window override; otherwise taken from the groomers' working hours. */
  openHour?: number;
  closeHour?: number;
  /**
   * Multi-dog bookings: one entry per dog with its own appointment length. When
   * supplied, a slot only shows as free if every dog can be seated (in parallel
   * on different groomers, or chained back-to-back).
   */
  petSlots?: PetSlotRequest[];
}

export function GroomingSlotPicker({
  tenantId,
  value,
  onChange,
  durationMinutes = 60,
  kind = "inhouse",
  resourceId = null,
  excludeBookingId = null,
  openHour,
  closeHour,
  petSlots,
}: GroomingSlotPickerProps) {
  const initial = value ? new Date(value) : new Date();
  const [monthCursor, setMonthCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date>(initial);
  const dateKey = dateKeyOf(selectedDate);

  const availabilityQ = useGroomingDayAvailability(tenantId, dateKey, kind);
  const resources = availabilityQ.data?.resources ?? [];
  const closures = availabilityQ.data?.closures ?? [];
  const busyRows = useMemo(
    () => (availabilityQ.data?.busy ?? []).filter((b) => (excludeBookingId ? b.id !== excludeBookingId : true)),
    [availabilityQ.data, excludeBookingId],
  );
  const multiPet = (petSlots?.length ?? 0) > 1;

  const hours = useMemo(() => {
    const fromResources = poolHours(resources);
    return {
      openHour: openHour ?? fromResources.openHour,
      closeHour: closeHour ?? fromResources.closeHour,
    };
  }, [resources, openHour, closeHour]);

  const dayClosure = isClosedDay(closures, dateKey);

  // Compute all 15-min slots for the day between open/close.
  const slots = useMemo(() => {
    const out: { start: Date; end: Date; label: string }[] = [];
    const step = 15;
    for (let h = hours.openHour * 60; h + durationMinutes <= hours.closeHour * 60; h += step) {
      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      start.setMinutes(h);
      const end = new Date(start.getTime() + durationMinutes * 60000);
      out.push({
        start,
        end,
        label: start.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }),
      });
    }
    return out;
  }, [selectedDate, hours.openHour, hours.closeHour, durationMinutes]);

  /** Per-slot free/busy across every groomer in the pool. */
  function slotState(start: Date, end: Date) {
    const { free, busyIds } = freeResourcesAt({ resources, busy: busyRows, start, end });
    const freeIds = new Set(free.map((r) => r.id));
    let disabled: boolean;
    if (multiPet) {
      disabled = !canSeatAll({
        resources,
        busy: busyRows,
        baseStart: start,
        pets: petSlots as PetSlotRequest[],
        preferredResourceId: resourceId,
        closeHour: hours.closeHour,
      });
    } else if (resourceId) {
      disabled = !freeIds.has(resourceId);
    } else {
      disabled = resources.length > 0 ? free.length === 0 : false;
    }
    return { free, freeIds, busyIds, disabled };
  }

  // Month grid
  const monthDays = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const startWeekday = (first.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthCursor]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="grid gap-4 md:grid-cols-[minmax(240px,300px)_1fr]">
        {/* Month calendar */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
              className="rounded-md p-1 hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold">
              {monthCursor.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}
            </div>
            <button
              type="button"
              onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
              className="rounded-md p-1 hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-medium uppercase text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((d, i) => {
              if (!d) return <div key={i} />;
              const past = d < today;
              const closed = isClosedDay(closures, dateKeyOf(d));
              const isSel = isSameDay(d, selectedDate);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={past || Boolean(closed)}
                  title={closed ? `Closed — ${closed.name ?? "closure"}` : undefined}
                  onClick={() => setSelectedDate(d)}
                  className={
                    "h-9 rounded-md text-xs font-medium transition-colors " +
                    (past
                      ? "text-muted-foreground opacity-40"
                      : closed
                        ? "cursor-not-allowed bg-muted text-muted-foreground line-through"
                        : isSel
                          ? "bg-sk-coral text-white"
                          : "hover:bg-sk-coral-soft")
                  }
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          {closures.length > 0 && (
            <div className="mt-2 text-[10px] text-muted-foreground">Struck-through days are closures.</div>
          )}
        </div>

        {/* Slot grid */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {selectedDate.toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "short" })}
            </div>
            <div className="text-[10px] text-muted-foreground">{durationMinutes} min slots</div>
          </div>
          {dayClosure ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-center text-sm text-muted-foreground">
              Closed — {dayClosure.name ?? "closure"}. Pick another day.
            </div>
          ) : availabilityQ.isLoading ? (
            <div className="grid grid-cols-3 gap-1.5">{Array.from({ length: 18 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />)}</div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
              {slots.map((s) => {
                const st = slotState(s.start, s.end);
                const sel = value && new Date(value).getTime() === s.start.getTime();
                const freeNames = st.free.map((r) => r.name).join(", ");
                return (
                  <button
                    key={s.start.toISOString()}
                    type="button"
                    disabled={st.disabled}
                    title={
                      st.disabled
                        ? "No groomer free"
                        : freeNames
                          ? `Free: ${freeNames}`
                          : undefined
                    }
                    onClick={() => onChange(toLocalIso(s.start), toLocalIso(s.end))}
                    className={
                      "flex flex-col items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-xs font-medium transition-colors " +
                      (st.disabled
                        ? "cursor-not-allowed border-transparent bg-muted text-muted-foreground line-through"
                        : sel
                          ? "border-sk-coral bg-sk-coral text-white"
                          : "border-border bg-white hover:border-sk-coral hover:bg-sk-coral-soft")
                    }
                  >
                    <span>{s.label}</span>
                    {resources.length > 0 && (
                      <span className="flex items-center gap-[3px]">
                        {resources.map((r, idx) => {
                          const isFree = st.freeIds.has(r.id);
                          const isPicked = resourceId === r.id;
                          return (
                            <span
                              key={r.id}
                              aria-label={`${r.name} ${isFree ? "free" : "busy"}`}
                              className={
                                "h-2 w-2 rounded-full border " +
                                (isFree ? "" : "opacity-40 ") +
                                (isPicked ? "ring-1 ring-offset-1 ring-sk-coral " : "")
                              }
                              style={{
                                borderColor: r.colour ?? "hsl(var(--border))",
                                backgroundColor: isFree ? (r.colour ?? "hsl(var(--muted-foreground))") : "transparent",
                              }}
                            />
                          );
                        })}
                      </span>
                    )}
                    {resources.length > 0 && (
                      <span className={"text-[9px] font-normal " + (sel ? "text-white/80" : "text-muted-foreground")}>
                        {st.disabled && !multiPet
                          ? "Full"
                          : `${st.free.length} of ${resources.length} free`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {resources.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              {resources.map((r, idx) => (
                <span key={r.id} className="inline-flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: r.colour ?? "hsl(var(--muted-foreground))" }}
                  />
                  {shortLabel(r, idx)} · {r.name}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sk-coral" /> Selected</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted" /> No one free</span>
            {resourceId
              ? <span>Times shown for the selected groomer; dots show the rest of the team.</span>
              : <span>Auto-assign — first free groomer takes the slot.</span>}
            {multiPet && <span>{petSlots!.length} dogs — parallel or back-to-back</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
