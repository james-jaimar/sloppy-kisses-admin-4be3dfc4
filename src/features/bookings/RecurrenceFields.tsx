import { Repeat } from "lucide-react";
import {
  describeRule,
  WEEKDAY_KEYS,
  type RecurrenceFrequency,
  type RecurrenceRuleInput,
  type WeekdayKey,
} from "./recurrence";

const WEEKDAY_LABEL: Record<WeekdayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

type EndMode = "never" | "on" | "after";

export interface RecurrenceValue {
  enabled: boolean;
  frequency: RecurrenceFrequency;
  interval: number;
  daysOfWeek: WeekdayKey[];
  endMode: EndMode;
  endDate: string; // yyyy-mm-dd
  count: number;
}

export const DEFAULT_RECURRENCE: RecurrenceValue = {
  enabled: false,
  frequency: "weekly",
  interval: 1,
  daysOfWeek: [],
  endMode: "after",
  endDate: "",
  count: 8,
};

export function toRule(v: RecurrenceValue): RecurrenceRuleInput | null {
  if (!v.enabled) return null;
  return {
    frequency: v.frequency,
    interval: v.interval,
    daysOfWeek: v.frequency === "weekly" ? v.daysOfWeek : undefined,
    endDate: v.endMode === "on" && v.endDate ? v.endDate : null,
    count: v.endMode === "after" ? v.count : null,
  };
}

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40";

interface Props {
  value: RecurrenceValue;
  onChange: (patch: Partial<RecurrenceValue>) => void;
  /** Anchor date used purely to preselect the current weekday. */
  anchorDate?: Date | null;
}

export function RecurrenceFields({ value, onChange, anchorDate }: Props) {
  const howOften =
    value.frequency === "monthly" ? "monthly" : value.frequency === "weekly" && value.interval === 2 ? "fortnightly" : "weekly";

  function setHowOften(v: string) {
    if (v === "monthly") onChange({ frequency: "monthly", interval: 1 });
    else if (v === "fortnightly") onChange({ frequency: "weekly", interval: 2 });
    else onChange({ frequency: "weekly", interval: 1 });
  }

  function toggleDay(k: WeekdayKey) {
    const set = new Set(value.daysOfWeek);
    set.has(k) ? set.delete(k) : set.add(k);
    onChange({ daysOfWeek: Array.from(set) });
  }

  function enable() {
    // Preselect weekday of the anchor date when turning weekly recurrence on.
    let days = value.daysOfWeek;
    if (value.frequency === "weekly" && days.length === 0 && anchorDate) {
      const idx = (anchorDate.getDay() + 6) % 7;
      days = [WEEKDAY_KEYS[idx]];
    }
    onChange({ enabled: true, daysOfWeek: days });
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-sk-surface-muted p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Repeat className="h-4 w-4 text-muted-foreground" />
          Book the same days again?
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => (e.target.checked ? enable() : onChange({ enabled: false }))}
          />
          Yes, book this again and again
        </label>
      </div>

      {value.enabled && (
        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">How often</div>
            <select value={howOften} onChange={(e) => setHowOften(e.target.value)} className={inputCls}>
              <option value="weekly">Every week</option>
              <option value="fortnightly">Every 2 weeks</option>
              <option value="monthly">Every month</option>
            </select>
          </div>

          {value.frequency === "weekly" && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Which days?</div>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_KEYS.map((k) => {
                  const active = value.daysOfWeek.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleDay(k)}
                      className={
                        "rounded-full border px-3 py-1 text-xs font-medium " +
                        (active
                          ? "border-sk-coral bg-sk-coral text-white"
                          : "border-border bg-white text-foreground hover:bg-muted")
                      }
                    >
                      {WEEKDAY_LABEL[k]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">When does it stop?</div>
              <select
                value={value.endMode}
                onChange={(e) => onChange({ endMode: e.target.value as EndMode })}
                className={inputCls}
              >
                <option value="after">After a set number of visits</option>
                <option value="on">On a date I choose</option>
                <option value="never">Keep going (we book 60 days ahead)</option>
              </select>
            </div>
            <div>
              {value.endMode === "after" && (
                <>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">How many visits?</div>
                  <input
                    type="number"
                    min={2}
                    max={120}
                    value={value.count}
                    onChange={(e) => onChange({ count: Math.max(2, Number(e.target.value) || 2) })}
                    className={inputCls}
                  />
                </>
              )}
              {value.endMode === "on" && (
                <>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Last day</div>
                  <input
                    type="date"
                    value={value.endDate}
                    onChange={(e) => onChange({ endDate: e.target.value })}
                    className={inputCls}
                  />
                </>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border bg-white px-3 py-2 text-xs text-muted-foreground">
            {describeRule(toRule(value))}
          </div>
        </div>
      )}
    </div>
  );
}