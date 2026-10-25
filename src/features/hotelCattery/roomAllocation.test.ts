import { describe, expect, it } from "vitest";
import { hotelResourceType, petsInRoom } from "./roomAllocation";

describe("mixed-pet hotel rooms", () => {
  const booking = { resource_id: "dog-room", resource: { type: "hotel_area" } };
  const pets = [
    { species: "dog", resource_id: "dog-room" },
    { species: "cat", resource_id: "cat-room" },
  ];
  it("assigns cats to Cat Hotel areas and dogs to Dog Hotel areas", () => {
    expect(hotelResourceType("cat")).toBe("cattery_area");
    expect(hotelResourceType("dog")).toBe("hotel_area");
  });
  it("counts each mixed-stay pet only in its own room", () => {
    expect(petsInRoom(pets, booking, "dog-room")).toEqual([pets[0]]);
    expect(petsInRoom(pets, booking, "cat-room")).toEqual([pets[1]]);
  });
  it("never places a legacy unassigned cat in a booking-wide dog room", () => {
    const legacy = [{ species: "dog" }, { species: "cat" }];
    expect(petsInRoom(legacy, booking, "dog-room")).toEqual([legacy[0]]);
    expect(petsInRoom(legacy, booking, null)).toEqual([legacy[1]]);
  });
});