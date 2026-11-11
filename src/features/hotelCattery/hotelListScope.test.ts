import { describe, expect, it } from "vitest";
import { hotelListRange, hotelLocalDay, hotelMovements } from "./hotelListScope";

const now = new Date("2026-11-11T05:37:00Z");
const row = (id: string, start_at: string, end_at: string | null) => ({ b: { id, start_at, end_at } });

describe("hotel Today register", () => {
  it("uses Johannesburg midnight boundaries for today", () => {
    expect(hotelListRange("today", now, now)).toEqual({ start: "2026-11-10T22:00:00.000Z", end: "2026-11-11T22:00:00.000Z" });
    expect(hotelLocalDay("2026-11-10T22:30:00Z")).toBe("2026-11-11");
  });
  it("includes departures from stays arriving in an earlier month", () => {
    const rows = hotelMovements([row("older", "2026-10-28T08:00:00Z", "2026-11-11T14:00:00Z")], now);
    expect(rows.map(r => [r.b.id, r.movement])).toEqual([["older", "departure"]]);
  });
  it("includes today's arrivals but excludes mid-stay guests and tomorrow's arrivals", () => {
    const rows = hotelMovements([
      row("incoming", "2026-11-11T07:00:00Z", "2026-11-19T08:00:00Z"),
      row("in-house", "2026-11-04T07:00:00Z", "2026-11-19T08:00:00Z"),
      row("tomorrow", "2026-11-11T22:00:00Z", null),
    ], now);
    expect(rows.map(r => [r.b.id, r.movement])).toEqual([["incoming", "arrival"]]);
  });
  it("shows both movements for a same-day stay and filters each independently", () => {
    const rows = hotelMovements([row("same-day", "2026-11-11T07:00:00Z", "2026-11-11T14:00:00Z")], now);
    expect(rows.map(r => r.movement)).toEqual(["arrival", "departure"]);
    expect(rows.filter(r => r.movement === "arrival")).toHaveLength(1);
    expect(rows.filter(r => r.movement === "departure")).toHaveLength(1);
  });
  it("orders movements by their own arrival or departure time", () => {
    const rows = hotelMovements([
      row("arrives-later", "2026-11-11T10:00:00Z", null),
      row("leaves-first", "2026-10-01T08:00:00Z", "2026-11-11T07:00:00Z"),
    ], now);
    expect(rows.map(r => r.b.id)).toEqual(["leaves-first", "arrives-later"]);
  });
  it("retains full-month arrival boundaries across the year end", () => {
    expect(hotelListRange("month", new Date(2026, 11, 1), now)).toEqual({ start: "2026-11-30T22:00:00.000Z", end: "2026-12-31T22:00:00.000Z" });
  });
});