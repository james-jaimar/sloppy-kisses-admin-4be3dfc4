import { describe, expect, it } from "vitest";
import { hotelGroomPrice } from "./groomQuoteChanges";

describe("hotel groom quote changes", () => {
  it("applies the 50% hotel checkout discount", () => {
    expect(hotelGroomPrice(500, 50)).toBe(250);
  });
});
