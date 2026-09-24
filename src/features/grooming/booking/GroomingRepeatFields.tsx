import { useMemo } from "react";
import { Repeat, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { dayKey, prettyDay } from "./dogPlan";

export interface GroomRepeatValue {
  enabled: boolean;
  mode: "interval" | "dates";
  weeks: number;
  visits: number;
  dates: string[]; // yyyy-mm-dd, extra visits only
  /** Dates the staff member removed from an interval series. */
  skipped: string[];
}

export const DEFAULT_GROOM_REPEAT: GroomRepeatValue = {
  enabled: false,
  mode: "interval",
  weeks: 6,
  visits: 3,
  dates: [],
  skipped: [],
};

const WEEK_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 12];

/** Future visit days (not including the first one). */
export function repeatDates(v: GroomRepeatValue, firstDay: string | null): string[] {
  if (!v.enabled || !firstDay) return [];
  if (v.mode === "dates") return [...v.dates].filter((d) => d > firstDay).sort();
  const out: string[] = [];
  const base = new Date(`${firstDay}T12:00:00`);
  for (let k = 1; k <= v.visits; k++) {
    const d = new Date(base);
    d.setDate(d.getDate() + k * v.weeks * 7);
    const key = dayKey(d);
    if (!v.skipped.includes(key)) out.push(key);
  }
  return out;
}

const chip =
  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors";
const chipOn = "border-sk-coral bg-sk-coral text-white";
const chipOff = "border-border bg-white text-foreground hover:bg-muted";

export function GroomingRepeatFields({
  value,
  onChange,
  firstDay,
  firstTime,
}: {
  value: GroomRepeatValue;
  onChange: (patch: Partial<GroomRepeatValue>) => void;
  firstDay: string | null;
  firstTime: string | null;
}) {
  const upcoming = useMemo(() => repeatDates(value, firstDay), [value, firstDay]);

  return (
    <div className="rounded-xl border border-dashed border-border bg-sk-surface-muted p-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={value.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        <Repeat className="h-4 w-4 text-muted-foreground" />
        Book this groom again
      </label>

      {value.enabled && !firstDay && (
        <p className="mt-2 text-xs text-muted-foreground">Pick the first day and time above first.</p>
      )}

      {value.enabled && firstDay && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChange({ mode: "interval" })}
              className={`${chip} ${value.mode === "interval" ? chipOn : chipOff}`}
            >
              Every few weeks
            </button>
            <button
              type="button"
              onClick={() => onChange({ mode: "dates" })}
              className={`${chip} ${value.mode === "dates" ? chipOn : chipOff}`}
            >
              I'll pick the dates
            </button>
          </div>

          {value.mode === "interval" ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">How often?</div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEK_OPTIONS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => onChange({ weeks: w, skipped: [] })}
                      className={`${chip} ${value.weeks === w ? chipOn : chipOff}`}
                    >
                      Every {w} weeks
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">How many more visits?</div>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 6, 8, 12].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => onChange({ visits: n, skipped: [] })}
                      className={`${chip} ${value.visits === n ? chipOn : chipOff}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                Tap every day the customer wants to come back
              </div>
              <div className="inline-block rounded-lg border border-border bg-white">
                <Calendar
                  mode="multiple"
                  selected={value.dates.map((d) => new Date(`${d}T12:00:00`))}
                  onSelect={(ds) => onChange({ dates: (ds ?? []).map(dayKey) })}
                  disabled={(d) => dayKey(d) <= firstDay}
                  defaultMonth={new Date(`${firstDay}T12:00:00`)}
                  numberOfMonths={2}
                  className="pointer-events-auto"
                />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-white p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {upcoming.length + 1} visits will be booked{firstTime ? ` at ${firstTime}` : ""}
            </div>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center justify-between">
                <span className="font-medium">{prettyDay(firstDay)}</span>
                <span className="text-xs text-muted-foreground">first visit</span>
              </li>
              {upcoming.map((d) => (
                <li key={d} className="flex items-center justify-between">
                  <span>{prettyDay(d)}</span>
                  <button
                    type="button"
                    title="Remove this date"
                    onClick={() =>
                      value.mode === "dates"
                        ? onChange({ dates: value.dates.filter((x) => x !== d) })
                        : onChange({ skipped: [...value.skipped, d] })
                    }
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-3 w-3" /> Remove
                  </button>
                </li>
              ))}
              {upcoming.length === 0 && (
                <li className="text-xs text-muted-foreground">No extra dates yet.</li>
              )}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Every dog gets its own appointment on each date, with the same package, extras and grooming sheet.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
