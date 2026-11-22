import { describe, expect, it } from "vitest";
import { hotelListRange, hotelLocalDay, hotelMovements, hotelRegisterRows, sortHotelRegister, hotelTodayRows } from "./hotelListScope";

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

describe("hotel desk periods and sorting", () => {
  it("includes earlier-month guests still staying in November", () => {
    const range = hotelListRange("month", new Date(2026, 10, 1), now);
    expect(hotelRegisterRows([row("older", "2026-10-28T08:00:00Z", "2026-11-11T14:00:00Z"), row("past", "2026-10-01T08:00:00Z", "2026-10-10T08:00:00Z")], range, "all").map(r => r.b.id)).toEqual(["older"]);
  });
  it("uses tomorrow's Johannesburg day", () => {
    expect(hotelListRange("tomorrow", now, now)).toEqual({ start: "2026-11-11T22:00:00.000Z", end: "2026-11-12T22:00:00.000Z" });
  });
  it("covers exactly seven days including today", () => {
    expect(hotelListRange("week", now, now)).toEqual({ start: "2026-11-10T22:00:00.000Z", end: "2026-11-17T22:00:00.000Z" });
  });
  it("selects the coming Saturday and Sunday from a weekday", () => {
    expect(hotelListRange("weekend", now, now)).toEqual({ start: "2026-11-13T22:00:00.000Z", end: "2026-11-15T22:00:00.000Z" });
  });
  it("retains the current weekend when it is Sunday", () => {
    expect(hotelListRange("weekend", now, new Date("2026-11-22T18:31:00Z"))).toEqual({ start: "2026-11-20T22:00:00.000Z", end: "2026-11-22T22:00:00.000Z" });
  });
  it("filters departures across all seven days, including earlier-month arrivals", () => {
    const rows = hotelRegisterRows([row("leaving", "2026-10-28T08:00:00Z", "2026-11-12T14:00:00Z"), row("staying", "2026-11-04T08:00:00Z", "2026-11-25T14:00:00Z")], hotelListRange("week", now, now), "departure");
    expect(rows.map(r => [r.b.id, r.movement])).toEqual([["leaving", "departure"]]);
  });
  it("sorts departures by checkout rather than arrival, leaving undated stays last", () => {
    const rows = [row("later", "2026-10-01T08:00:00Z", "2026-11-15T14:00:00Z"), row("first", "2026-11-01T08:00:00Z", "2026-11-12T14:00:00Z"), row("undated", "2026-11-01T08:00:00Z", null)];
    expect(sortHotelRegister(rows, "out").map(r => r.b.id)).toEqual(["first", "later", "undated"]);
    expect(sortHotelRegister(rows, "out", true).map(r => r.b.id)).toEqual(["later", "first", "undated"]);
    expect(rows[0].b.id).toBe("later");
  });
  it("sorts clients and pets alphabetically", () => {
    const rows = [{ ...row("z", "2026-11-01T08:00:00Z", null), b: { ...row("z", "2026-11-01T08:00:00Z", null).b, customer: { full_name: "Zelda" } }, pets: [{ name: "Alfie" }] }, { ...row("a", "2026-11-01T08:00:00Z", null), b: { ...row("a", "2026-11-01T08:00:00Z", null).b, customer: { full_name: "Alice" } }, pets: [{ name: "Zorro" }] }];
    expect(sortHotelRegister(rows, "client").map(r => r.b.id)).toEqual(["a", "z"]);
    expect(sortHotelRegister(rows, "pet").map(r => r.b.id)).toEqual(["z", "a"]);
  });
  it("in-house excludes arrivals that have not checked in", () => {
    const rows = ["confirmed", "checked_in"].map(status => ({ b: { start_at: "2026-11-11T07:00:00Z", end_at: "2026-11-20T07:00:00Z", status } }));
    expect(hotelRegisterRows(rows, hotelListRange("today", now, now), "inhouse").map(r => r.b.status)).toEqual(["checked_in"]);
  });
  it("today overview excludes cancelled, completed and no-show departures", () => {
    const rows = ["cancelled", "completed", "no_show", "checked_in"].map(status => ({ start_at: "2026-10-28T08:00:00Z", end_at: "2026-11-11T14:00:00Z", status }));
    expect(hotelTodayRows(rows, now).departures.map(r => r.status)).toEqual(["checked_in"]);
  });
});