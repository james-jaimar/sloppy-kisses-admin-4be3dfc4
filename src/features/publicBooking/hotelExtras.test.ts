import { describe, expect, it } from "vitest";
import { priceHotelExtras } from "../../../supabase/functions/_shared/hotel-extras";

const catalog = [
  { id: "walk-id", code: "walk", name: "Walk", price_zar: 100, per_night: true },
  { id: "play-id", code: "late_checkout", name: "Stay & Play", price_zar: 250, per_night: false },
];
describe("hotel extras pricing and persisted quantities", () => {
  it("charges two total walks for each of two dogs, regardless of seven nights", () => {
    expect(priceHotelExtras(catalog, [{ code: "walk", quantity: 2 }], 2, 7)[0]).toMatchObject({ id: "walk-id", quantity: 4, billedQuantity: 4, total: 400, quantity_basis: "total" });
  });
  it("charges Stay & Play once for each dog, not for every night", () => {
    expect(priceHotelExtras(catalog, [{ code: "late_checkout", quantity: 1 }], 2, 7)[0]).toMatchObject({ quantity: 2, billedQuantity: 2, total: 500 });
  });
  it("late collection includes Stay & Play once without duplicating a carried selection", () => {
    expect(priceHotelExtras(catalog, [{ code: "late_checkout", quantity: 1 }], 2, 7, "Stay & Play 16:00–16:30")).toHaveLength(1);
  });
  it("morning collection removes the late collection extra", () => {
    expect(priceHotelExtras(catalog, [{ code: "late_checkout", quantity: 1 }], 2, 7, "09:00–09:30")).toEqual([]);
  });
  it("rejects fractions", () => { expect(() => priceHotelExtras(catalog, [{ code: "walk", quantity: 1.5 }], 2, 7)).toThrow(); });
  it("rejects extras outside the active tenant catalog", () => { expect(() => priceHotelExtras(catalog, [{ code: "other", quantity: 1 }], 2, 7)).toThrow(); });
  it("rejects duplicate selections", () => { expect(() => priceHotelExtras(catalog, [{ code: "walk", quantity: 1 }, { code: "walk", quantity: 2 }], 2, 7)).toThrow(); });
});