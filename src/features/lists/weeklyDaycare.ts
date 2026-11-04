import type { DaycareEnrolment, DaySwap } from "@/features/daycare/queries";

export interface WeeklyVisit { petId: string; pet: string; owner: string; date: string; label: string }
export interface WeeklyRow { petId: string; pet: string; owner: string; days: Record<string, string[]> }
export function weekDays(date: Date) {
  const monday = new Date(date); monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday); d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
}
export function weeklyDaycareRows(days: string[], enrolments: DaycareEnrolment[], swaps: DaySwap[], visits: WeeklyVisit[]) {
  const rows = new Map<string, WeeklyRow>();
  function add(v: WeeklyVisit) {
    if (!days.includes(v.date)) return;
    const row = rows.get(v.petId) ?? { petId: v.petId, pet: v.pet, owner: v.owner, days: {} };
    const labels = row.days[v.date] ?? [];
    if (!labels.includes(v.label)) labels.push(v.label);
    row.days[v.date] = labels; rows.set(v.petId, row);
  }
  const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat"];
  for (const e of enrolments.filter(e => e.active)) {
    days.forEach((date, i) => {
      const out = swaps.some(s => s.daycare_enrolment_id === e.id && s.status !== "cancelled" && s.original_date === date);
      const incoming = swaps.some(s => s.daycare_enrolment_id === e.id && s.status !== "cancelled" && s.new_date === date);
      const scheduled = e.selected_days.includes(weekdays[i]) && date >= e.start_date && (!e.end_date || date <= e.end_date);
      if ((scheduled && !out) || incoming) add({ petId: e.pet_id, pet: e.pet?.name ?? "Pet", owner: e.customer?.full_name ?? "", date, label: incoming ? "Swap" : e.plan?.name ?? "Daycare" });
    });
  }
  visits.forEach(add);
  return [...rows.values()].sort((a, b) => a.pet.localeCompare(b.pet) || a.owner.localeCompare(b.owner));
}