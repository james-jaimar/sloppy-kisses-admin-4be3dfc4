import { describe, expect, it } from "vitest";
import { accommodationForPet, rescaleHotelExtras } from "./stayPetRules";

const catalog = [{ id: "walk", code: "walk" }];
describe("hotel pet changes", () => {
  it("offers 22 walks when a second dog joins an 11-walk stay", () => {
    expect(rescaleHotelExtras([{ surcharge_id: "walk", quantity: 11 }], catalog, { pets: 1, dogs: 1 }, { pets: 2, dogs: 2 })[0].quantity).toBe(22);
  });
  it("does not increase walks when a cat joins", () => {
    expect(rescaleHotelExtras([{ surcharge_id: "walk", quantity: 11 }], catalog, { pets: 1, dogs: 1 }, { pets: 2, dogs: 1 })[0].quantity).toBe(11);
  });
  it("halves 22 walks when one of two dogs is removed", () => {
    expect(rescaleHotelExtras([{ surcharge_id: "walk", quantity: 22 }], catalog, { pets: 2, dogs: 2 }, { pets: 1, dogs: 1 })[0].quantity).toBe(11);
  });
  it("removes walks when the last dog is removed", () => {
    expect(rescaleHotelExtras([{ surcharge_id: "walk", quantity: 11 }], catalog, { pets: 2, dogs: 1 }, { pets: 1, dogs: 0 })).toEqual([]);
  });
  it("never defaults a cat into dog accommodation", () => {
    expect(accommodationForPet({ species: "cat" }, [{ species: "dog", accommodation_type: "dog-room" }, { species: "cat", accommodation_type: "cat-room" }], "dog-room")).toBe("cat-room");
  });
  it("does not fall back to another species when no matching rate exists", () => {
    expect(accommodationForPet({ species: "cat" }, [{ species: "dog", accommodation_type: "dog-room" }], "dog-room")).toBe("");
  });
});