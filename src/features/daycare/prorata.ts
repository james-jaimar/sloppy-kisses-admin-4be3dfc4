import type { Weekday } from "./queries";

const DOW: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DEFAULT_DAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri"];

export interface ProrataQuote {
  isPartial: boolean;
  daysBilled: number;
  daysTotal: number;
  amount: number;
  periodStart: string;
  periodEnd: string;
}

/**
 * Mirrors the DB function `daycare_prorata_quote`: an enrolment that starts after
 * the 1st is charged plan price x (remaining attendance days / attendance days in month).
 */
export function prorataQuote(
  startDateIso: string,
  endDateIso: string | null,
  selectedDays: Weekday[],
  planPrice: number,
): ProrataQuote | null {
  if (!startDateIso) return null;
  const start = new Date(`${startDateIso}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;

  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);

  let periodEnd = monthEnd;
  if (endDateIso) {
    const end = new Date(`${endDateIso}T00:00:00`);
    if (!Number.isNaN(end.getTime()) && end < monthEnd) periodEnd = end;
  }

  const days = selectedDays.length ? selectedDays : DEFAULT_DAYS;
  const count = (from: Date, to: Date) => {
    let n = 0;
    for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      if (days.includes(DOW[d.getDay()])) n += 1;
    }
    return n;
  };

  const daysTotal = count(monthStart, monthEnd);
  if (daysTotal === 0) return null;
  const daysBilled = count(start, periodEnd);
  const amount = Math.round(planPrice * (daysBilled / daysTotal) * 100) / 100;

  return {
    isPartial: start.getDate() !== 1,
    daysBilled,
    daysTotal,
    amount,
    periodStart: startDateIso,
    periodEnd: periodEnd.toISOString().slice(0, 10),
  };
}
