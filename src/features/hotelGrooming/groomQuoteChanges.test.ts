import { describe, expect, it } from "vitest";
import { groomsAddedAfterQuote, hotelGroomPrice } from "./groomQuoteChanges";

describe("hotel groom quote changes", () => {
  it("applies the 50% hotel checkout discount", () => {
    expect(hotelGroomPrice(500, 50)).toBe(250);
  });
  it("flags grooms added after the quote was sent", () => {
    const rows = [
      { created_at: "2026-11-25T13:30:00Z", status: "pending" },
      { created_at: "2026-11-20T10:00:00Z", status: "pending" },
      { created_at: "2026-11-25T13:31:00Z", status: "declined" },
    ];
    expect(groomsAddedAfterQuote(rows, "2026-11-22T18:17:27Z")).toHaveLength(1);
  });
});
