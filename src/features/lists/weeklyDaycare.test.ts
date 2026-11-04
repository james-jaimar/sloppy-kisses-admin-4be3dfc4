import { expect, it } from "vitest";
import { weekDays, weeklyDaycareRows } from "./weeklyDaycare";
import type { DaycareEnrolment } from "@/features/daycare/queries";
const days = weekDays(new Date("2026-11-04T12:00:00"));
const e = { id: "enr", active: true, pet_id: "dog", selected_days: ["mon", "sat"], start_date: "2026-01-01", end_date: null, pet: { name: "Dog" }, customer: { full_name: "Owner" }, plan: { name: "Regular" } } as DaycareEnrolment;
it("prints Monday through Saturday", () => expect(days).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]));
it("marks scheduled Saturday and merges hotel, grooming and trial visits", () => {
  const rows = weeklyDaycareRows(days, [e], [], [
    { petId: "dog", pet: "Dog", owner: "Owner", date: days[1], label: "Hotel S&P" },
    { petId: "groom", pet: "Groom", owner: "Owner", date: days[2], label: "Grooming S&P" },
    { petId: "trial", pet: "Trial", owner: "Owner", date: days[3], label: "Trial" },
  ]);
  expect(rows).toHaveLength(3);
  expect(rows[0].days[days[5]]).toEqual(["Regular"]);
  expect(rows[0].days[days[1]]).toEqual(["Hotel S&P"]);
  expect(rows[1].days[days[2]]).toEqual(["Grooming S&P"]);
  expect(rows[2].days[days[3]]).toEqual(["Trial"]);
});
it("moves a scheduled day to its swapped date", () => {
  const rows = weeklyDaycareRows(days, [e], [{ id: "s", tenant_id: "t", daycare_enrolment_id: "enr", pet_id: "dog", original_date: days[0], new_date: days[2], status: "approved", reason: null }], []);
  expect(rows[0].days[days[0]]).toBeUndefined(); expect(rows[0].days[days[2]]).toEqual(["Swap"]);
});