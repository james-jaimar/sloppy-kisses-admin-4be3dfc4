/**
 * Pure occurrence generator for the `recurring_rules` table.
 *
 * We deliberately keep this side-effect free so we can unit test it and reuse
 * it wherever we need to preview or persist a series.
 */

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** Weekday index used by the generator (0 = Mon ... 6 = Sun). */
const WEEKDAY_INDEX: Record<WeekdayKey, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
};

/** Convert JS Date's Sun=0..Sat=6 into Mon=0..Sun=6 for internal use. */
function isoWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export interface RecurrenceRuleInput {
  frequency: RecurrenceFrequency;
  /** Interval between events (every N days/weeks/months). Minimum 1. */
  interval: number;
  /** For weekly rules: which weekdays are in the series. */
  daysOfWeek?: WeekdayKey[];
  /** ISO date (yyyy-mm-dd) inclusive stop; null = open-ended. */
  endDate?: string | null;
  /** Max number of generated occurrences (safety cap). */
  count?: number | null;
}

export interface GeneratedOccurrence {
  start_at: string; // ISO
  end_at: string;   // ISO
}

export interface ExpandOptions {
  /** ISO start of the first (template) occurrence. */
  startAt: string;
  /** ISO end of the first (template) occurrence. */
  endAt: string;
  rule: RecurrenceRuleInput;
  /** How far ahead we will materialise bookings. Default 60 days. */
  horizonDays?: number;
  /** Hard safety cap on generated rows (default 120). */
  maxOccurrences?: number;
}

/**
 * Expand a rule into concrete occurrence datetimes.
 *
 * The first occurrence is always the passed-in start/end (that's the row the
 * staff member just filled in). Subsequent occurrences preserve the same
 * wall-clock time and duration.
 */
export function expandRecurrence(opts: ExpandOptions): GeneratedOccurrence[] {
  const { startAt, endAt, rule } = opts;
  const horizonDays = opts.horizonDays ?? 60;
  const hardCap = opts.maxOccurrences ?? 120;

  const start = new Date(startAt);
  const end = new Date(endAt);
  const durationMs = end.getTime() - start.getTime();
  if (Number.isNaN(start.getTime()) || durationMs <= 0) return [];

  const horizonEnd = new Date(start.getTime() + horizonDays * 86400_000);
  const ruleEnd = rule.endDate ? endOfDay(new Date(rule.endDate)) : null;
  const stopAt = ruleEnd && ruleEnd < horizonEnd ? ruleEnd : horizonEnd;
  const targetCount = rule.count && rule.count > 0 ? Math.min(rule.count, hardCap) : hardCap;
  const interval = Math.max(1, Math.floor(rule.interval || 1));

  const out: GeneratedOccurrence[] = [
    { start_at: start.toISOString(), end_at: new Date(start.getTime() + durationMs).toISOString() },
  ];

  if (rule.frequency === "daily") {
    let cursor = addDays(start, interval);
    while (cursor <= stopAt && out.length < targetCount) {
      out.push({ start_at: cursor.toISOString(), end_at: new Date(cursor.getTime() + durationMs).toISOString() });
      cursor = addDays(cursor, interval);
    }
  } else if (rule.frequency === "weekly") {
    const days = (rule.daysOfWeek && rule.daysOfWeek.length > 0
      ? rule.daysOfWeek
      : [WEEKDAY_KEYS[isoWeekday(start)]]).map((k) => WEEKDAY_INDEX[k]).sort((a, b) => a - b);

    // Walk day-by-day; when we cross a week boundary, skip (interval - 1) weeks.
    let cursor = addDays(start, 1);
    let weekStart = startOfWeekMon(start);
    while (cursor <= stopAt && out.length < targetCount) {
      const cursorWeekStart = startOfWeekMon(cursor);
      if (cursorWeekStart.getTime() !== weekStart.getTime()) {
        // moved into a new week — enforce interval
        const weeksApart = Math.round((cursorWeekStart.getTime() - weekStart.getTime()) / (7 * 86400_000));
        if (weeksApart < interval) {
          cursor = addDays(cursorWeekStart, 7 * (interval - weeksApart));
          continue;
        }
        weekStart = cursorWeekStart;
      }
      if (days.includes(isoWeekday(cursor))) {
        out.push({
          start_at: cursor.toISOString(),
          end_at: new Date(cursor.getTime() + durationMs).toISOString(),
        });
      }
      cursor = addDays(cursor, 1);
    }
  } else if (rule.frequency === "monthly") {
    // Same day-of-month; if the target month is shorter, clamp to the last day.
    let n = 1;
    while (out.length < targetCount) {
      const next = addMonthsSameDay(start, n * interval);
      if (next > stopAt) break;
      out.push({
        start_at: next.toISOString(),
        end_at: new Date(next.getTime() + durationMs).toISOString(),
      });
      n++;
    }
  }

  return out;
}

/** Human-friendly summary for the UI (e.g. "Every 2 weeks on Mon, Wed until 30 Nov 2026"). */
export function describeRule(rule: RecurrenceRuleInput | null): string {
  if (!rule) return "Does not repeat";
  const interval = Math.max(1, rule.interval || 1);
  const unit = rule.frequency === "daily" ? "day" : rule.frequency === "weekly" ? "week" : "month";
  const every = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
  let body = every;
  if (rule.frequency === "weekly" && rule.daysOfWeek && rule.daysOfWeek.length) {
    const pretty: Record<WeekdayKey, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
    body += ` on ${rule.daysOfWeek.map((d) => pretty[d]).join(", ")}`;
  }
  if (rule.endDate) body += ` until ${formatShort(new Date(rule.endDate))}`;
  else if (rule.count) body += ` for ${rule.count} occurrences`;
  return body;
}

// ---------- tiny date helpers (kept local so this file has zero deps) ----------

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function startOfWeekMon(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = (r.getDay() + 6) % 7; // Mon=0
  r.setDate(r.getDate() - day);
  return r;
}
function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}
function addMonthsSameDay(d: Date, months: number): Date {
  const targetMonth = d.getMonth() + months;
  const r = new Date(d);
  r.setDate(1);
  r.setMonth(targetMonth);
  const lastDayOfTarget = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), lastDayOfTarget));
  r.setHours(d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return r;
}
function formatShort(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}