/** Initial hotel events always acknowledge a request, even if dispatched after confirmation. */
export function hotelNotificationTemplate(
  eventType: string,
  serviceType: string | null | undefined,
  toStatus: string | null | undefined,
  staffConfirmed: boolean,
): string | null {
  if (serviceType !== "hotel_dog" && serviceType !== "hotel_cat") return eventType;
  if (eventType === "booking_created") return "hotel_booking_requested";
  if (eventType === "booking_status_changed" && toStatus === "confirmed") {
    return staffConfirmed ? "hotel_booking_confirmed" : null;
  }
  return eventType;
}