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
          Repeat
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => (e.target.checked ? enable() : onChange({ enabled: false }))}
          />
          Make this a recurring series
        </label>
      </div>

      {value.enabled && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Frequency</div>
              <select
                value={value.frequency}
                onChange={(e) => onChange({ frequency: e.target.value as RecurrenceFrequency })}
                className={inputCls}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Every</div>
              <input
                type="number"
                min={1}
                max={12}
                value={value.interval}
                onChange={(e) => onChange({ interval: Math.max(1, Number(e.target.value) || 1) })}
                className={inputCls}
              />
            </div>
          </div>

          {value.frequency === "weekly" && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">On</div>
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
              <div className="mb-1 text-xs font-medium text-muted-foreground">Ends</div>
              <select
                value={value.endMode}
                onChange={(e) => onChange({ endMode: e.target.value as EndMode })}
                className={inputCls}
              >
                <option value="after">After N occurrences</option>
                <option value="on">On a specific date</option>
                <option value="never">Never (60-day rolling window)</option>
              </select>
            </div>
            <div>
              {value.endMode === "after" && (
                <>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Occurrences</div>
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
                  <div className="mb-1 text-xs font-medium text-muted-foreground">End date</div>
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