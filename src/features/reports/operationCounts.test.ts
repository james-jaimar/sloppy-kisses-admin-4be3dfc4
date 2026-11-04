import { expect, it } from "vitest";
import { hotelDayCounts, mobileStopKey, type VolumeBooking } from "./operationCounts";
const b: VolumeBooking = { id: "a", service_type: "hotel_dog", start_at: "2026-11-04T09:00:00Z", end_at: "2026-11-04T15:00:00Z", pet_count: 2 };
it("counts two pets for hotel arrivals and departures on the same day", () => {
  expect(hotelDayCounts([b], "2026-11-04T00:00:00Z", "2026-11-05T00:00:00Z")).toEqual({ dogsIn: 2, checkingIn: 2, checkingOut: 2 });
});
it("counts multiple dogs at one address on one van as one stop", () => {
  const visit = { ...b, customer_id: "c", service_address_id: "address", resource_id: "van" };
  expect(new Set([mobileStopKey(visit), mobileStopKey({ ...visit, id: "dog2", start_at: "2026-11-04T10:00:00Z" })]).size).toBe(1);
  expect(mobileStopKey({ ...visit, resource_id: "van2" })).not.toBe(mobileStopKey(visit));
});