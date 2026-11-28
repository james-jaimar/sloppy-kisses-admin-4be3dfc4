import { describe, expect, it } from "vitest";
import { groomingDurationPrice } from "./durationOverride";
import { planDogTimes } from "./dogPlan";

describe("per-dog grooming duration and surcharge", () => {
  it("charges R50 for each extra 15 minutes", () => {
    expect(groomingDurationPrice(90, 105, null, 50).mattedSurchargeZar).toBe(50);
    expect(groomingDurationPrice(90, 150, null, 50).mattedSurchargeZar).toBe(200);
  });
  it("allows staff to override the amount, including R0", () => {
    expect(groomingDurationPrice(90, 150, 175, 50).mattedSurchargeZar).toBe(175);
    expect(groomingDurationPrice(90, 150, 0, 50).mattedSurchargeZar).toBe(0);
  });
  it("keeps each dog's time and charge separate in a multi-dog schedule", () => {
    const first = groomingDurationPrice(90, 150, null, 50);
    const second = groomingDurationPrice(60, 75, null, 50);
    const slots = planDogTimes({ mode: "back_to_back", resources: [{ id: "station", name: "Station" }], busy: [], baseStart: new Date("2026-11-28T08:00:00+02:00"), pets: [
      { petId: "husky", durationMinutes: first.durationMinutes },
      { petId: "poodle", durationMinutes: second.durationMinutes },
    ] });
    expect(first.mattedSurchargeZar).toBe(200);
    expect(second.mattedSurchargeZar).toBe(50);
    expect(slots?.map(s => (s.end.getTime() - s.start.getTime()) / 60000)).toEqual([150, 75]);
    expect(slots?.[1]?.start).toEqual(slots?.[0]?.end);
  });
  it("does not add a surcharge for standard or shorter appointments", () => {
    expect(groomingDurationPrice(90, null, null, 50).mattedSurchargeZar).toBe(0);
    expect(groomingDurationPrice(90, 60, null, 50).mattedSurchargeZar).toBe(0);
  });
  it("uses the configured rate and rounds partial 15-minute blocks up", () => {
    expect(groomingDurationPrice(90, 110, null, 50).mattedSurchargeZar).toBe(100);
    expect(groomingDurationPrice(90, 150, null, 60).mattedSurchargeZar).toBe(240);
  });
  it("preserves a saved appointment duration and custom charge when reopened", () => {
    expect(groomingDurationPrice(90, 150, 125, 50)).toMatchObject({ durationMinutes: 150, mattedSurchargeZar: 125 });
  });
});