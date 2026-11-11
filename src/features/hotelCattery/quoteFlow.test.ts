import { describe, it, expect } from "vitest";
import { hotelNeedsAcceptance, publicHotelQuoteLink } from "./quoteFlow";

describe("hotel quote-first workflow", () => {
  it("keeps a simple received enquiry in quote actions before medical intake", () => {
    expect(hotelNeedsAcceptance("requested", "draft")).toBe(true);
  });
  it("opens information gathering once the customer accepts", () => {
    expect(hotelNeedsAcceptance("needs_info", "accepted")).toBe(false);
  });
  it("never sends confirmed stays back to quote acceptance", () => {
    expect(hotelNeedsAcceptance("confirmed", "draft", true)).toBe(false);
  });
  it("copies the same public no-login quote route used in email on the configured customer site", () => {
    expect(publicHotelQuoteLink("https://sloppykisses.jaimar.dev/", "quote-token")).toBe("https://sloppykisses.jaimar.dev/q/quote-token");
    expect(() => publicHotelQuoteLink(null, "quote-token")).toThrow();
  });
});