import { describe, it, expect } from "vitest";
import { hotelNeedsAcceptance, publicHotelQuoteLink, quoteSendState } from "./quoteFlow";

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
  it("flags a prepared quote that was never emailed or linked as not sent", () => {
    expect(quoteSendState({ status: "draft", sent_at: null })).toBe("prepared");
  });
  it("treats an emailed or link-copied quote as sent while awaiting acceptance", () => {
    expect(quoteSendState({ status: "sent", sent_at: "2026-11-11T10:00:00Z" })).toBe("sent");
  });
  it("treats customer acceptance as accepted regardless of send state", () => {
    expect(quoteSendState({ status: "accepted", accepted_at: "2026-11-11T12:00:00Z", sent_at: "2026-11-11T10:00:00Z" })).toBe("accepted");
  });
});