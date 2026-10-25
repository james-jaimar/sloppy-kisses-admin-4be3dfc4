import { describe, expect, it } from "vitest";
import { hotelNotificationTemplate } from "../../../supabase/functions/_shared/hotel-notifications";

describe("hotel notification lifecycle", () => {
  it("acknowledges dog and cat requests without asserting confirmation", () => {
    for (const service of ["hotel_dog", "hotel_cat"]) {
      expect(hotelNotificationTemplate("booking_created", service, "requested", false)).toBe("hotel_booking_requested");
      expect(hotelNotificationTemplate("booking_created", service, "confirmed", true)).toBe("hotel_booking_requested");
    }
  });
  it("requires staff confirmation before selecting the hotel confirmation template", () => {
    expect(hotelNotificationTemplate("booking_status_changed", "hotel_dog", "confirmed", false)).toBeNull();
    expect(hotelNotificationTemplate("booking_status_changed", "hotel_dog", "confirmed", true)).toBe("hotel_booking_confirmed");
  });
  it("leaves other services and cancellation notices unchanged", () => {
    expect(hotelNotificationTemplate("booking_created", "grooming_inhouse", "confirmed", false)).toBe("booking_created");
    expect(hotelNotificationTemplate("booking_cancelled", "hotel_cat", "cancelled", false)).toBe("booking_cancelled");
  });
});