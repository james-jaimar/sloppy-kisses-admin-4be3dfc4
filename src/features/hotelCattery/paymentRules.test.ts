import { describe, expect, it } from "vitest";
import { hotelPaymentPercent } from "./paymentRules";
describe("Hotel payment cutoff", () => {
  it("requires 50% more than 30 days before arrival", () => expect(hotelPaymentPercent("2026-11-25", "2026-10-25")).toBe(50));
  it("requires 100% exactly 30 days before arrival", () => expect(hotelPaymentPercent("2026-11-24", "2026-10-25")).toBe(100));
  it("requires 100% less than 30 days before arrival", () => expect(hotelPaymentPercent("2026-11-23", "2026-10-25")).toBe(100));
  it("uses an explicit override", () => expect(hotelPaymentPercent("2026-11-23", "2026-10-25", 30, 50, 25)).toBe(25));
});