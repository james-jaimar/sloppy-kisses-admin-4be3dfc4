import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

interface DayAvailability {
  pool: number;
  busy: { id: string; start_at: string; end_at: string | null; resource_id: string | null }[];
}

/**
 * Day availability via a security-definer RPC so both staff and portal customers
 * get the same view. Customers cannot read `bookings`/`resources` directly, and the
 * RPC returns only anonymous busy intervals — no customer or pet details.
 */
function useDayAvailability(tenantId: string | null | undefined, date: string) {
  return useQuery({
    queryKey: ["grooming_day_availability", tenantId, date],
    enabled: Boolean(tenantId && date),
    queryFn: async (): Promise<DayAvailability> => {
      const { data, error } = await supabase.rpc("grooming_day_availability" as any, {
        p_tenant_id: tenantId as string,
        p_day: date,
      });
      if (error) throw error;
      const row = (data ?? {}) as any;
      return { pool: Math.max(1, Number(row.pool ?? 1)), busy: (row.busy ?? []) as DayAvailability["busy"] };
    },
  });
}

function toLocalIso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface GroomingSlotPickerProps {
  tenantId: string | null | undefined;
  /** ISO local datetime string (no timezone) — the selected slot start. */
  value: string | null;
  onChange: (isoLocal: string | null, endIsoLocal: string | null) => void;
  /** Slot length in minutes — packages typically 60. Falls back to 60. */
  durationMinutes?: number;
  /** Only count conflicts on this resource; otherwise treat all grooming resources as a pool. */
  resourceId?: string | null;
  /** Ignore a booking id (edit-mode). */
  excludeBookingId?: string | null;
  /** Operating window; defaults 08:00–17:00 local. */
  openHour?: number;
  closeHour?: number;
}

export function GroomingSlotPicker({
  tenantId,
  value,
  onChange,
  durationMinutes = 60,
  resourceId = null,
  excludeBookingId = null,
  openHour = 8,
  closeHour = 17,
}: GroomingSlotPickerProps) {
  const initial = value ? new Date(value) : new Date();
  const [monthCursor, setMonthCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date>(initial);
  const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

  const availabilityQ = useDayAvailability(tenantId, dateKey);
  const poolSize = availabilityQ.data?.pool ?? 1;

  // Compute all 15-min slots for the day between open/close.
  const slots = useMemo(() => {
    const out: { start: Date; end: Date; label: string }[] = [];
    const step = 15;
    for (let h = openHour * 60; h + durationMinutes <= closeHour * 60; h += step) {
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
  }, [selectedDate, openHour, closeHour, durationMinutes]);

  // For each slot: how many concurrent bookings overlap.
  function slotIsFull(start: Date, end: Date) {
    const rows = (availabilityQ.data?.busy ?? []).filter((b) => (excludeBookingId ? b.id !== excludeBookingId : true));
    const overlapping = rows.filter((b) => {
      const bStart = new Date(b.start_at);
      const bEnd = b.end_at ? new Date(b.end_at) : new Date(bStart.getTime() + 60 * 60000);
      return bStart < end && bEnd > start;
    });
    if (resourceId) {
      return overlapping.some((b) => b.resource_id === resourceId);
    }
    return overlapping.length >= poolSize;
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
              const isSel = isSameDay(d, selectedDate);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={past}
                  onClick={() => setSelectedDate(d)}
                  className={
                    "h-9 rounded-md text-xs font-medium transition-colors " +
                    (past
                      ? "text-muted-foreground opacity-40"
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
        </div>

        {/* Slot grid */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {selectedDate.toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "short" })}
            </div>
            <div className="text-[10px] text-muted-foreground">{durationMinutes} min slots</div>
          </div>
          {availabilityQ.isLoading ? (
            <div className="grid grid-cols-4 gap-1.5">{Array.from({ length: 20 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded-md bg-muted" />)}</div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 md:grid-cols-5">
              {slots.map((s) => {
                const busy = slotIsFull(s.start, s.end);
                const sel = value && new Date(value).getTime() === s.start.getTime();
                return (
                  <button
                    key={s.start.toISOString()}
                    type="button"
                    disabled={busy}
                    onClick={() => onChange(toLocalIso(s.start), toLocalIso(s.end))}
                    className={
                      "h-8 rounded-md border text-xs font-medium transition-colors " +
                      (busy
                        ? "cursor-not-allowed border-transparent bg-muted text-muted-foreground line-through"
                        : sel
                          ? "border-sk-coral bg-sk-coral text-white"
                          : "border-border bg-white hover:border-sk-coral hover:bg-sk-coral-soft")
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sk-coral" /> Selected</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted" /> Taken</span>
            {resourceId ? <span>Filtered to selected resource</span> : <span>{poolSize} groomer{poolSize === 1 ? "" : "s"} in pool</span>}
          </div>
        </div>
      </div>
    </div>
  );
}