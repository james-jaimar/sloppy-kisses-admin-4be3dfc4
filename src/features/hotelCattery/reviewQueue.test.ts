import { describe, expect, it } from "vitest";
import { hotelNeedsReview, hotelQuoteNeedsAttention } from "./reviewQueue";

describe("hotel review queue", () => {
  it("includes requests and outstanding intake", () => {
    expect(hotelNeedsReview("requested")).toBe(true);
    expect(hotelNeedsReview("needs_info")).toBe(true);
    expect(hotelNeedsReview("approved")).toBe(true);
  });
  it("excludes staff-confirmed and closed stays", () => {
    for (const status of ["confirmed", "checked_in", "completed", "cancelled", "no_show"]) {
      expect(hotelNeedsReview(status)).toBe(false);
    }
  });
  it("counts open quotes but never counts converted quotes twice", () => {
    expect(hotelQuoteNeedsAttention("draft", null)).toBe(true);
    expect(hotelQuoteNeedsAttention("sent", null)).toBe(true);
    expect(hotelQuoteNeedsAttention("sent", "booking-id")).toBe(false);
    expect(hotelQuoteNeedsAttention("accepted", null)).toBe(false);
    expect(hotelQuoteNeedsAttention("expired", null)).toBe(false);
  });
});