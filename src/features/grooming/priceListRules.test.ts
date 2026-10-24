import { describe, expect, it } from "vitest";
import { groomingAddonPrice, mattedOvertimePrice, pensionerEligible } from "./priceListRules";

describe("October grooming price list", () => {
  it("includes standard treatments in Full grooming", () => {
    for (const [code, price] of [["hygiene_cut", 50], ["teeth_gel", 130], ["ear_clean", 130], ["nail_trim", 130], ["anal_gland", 185], ["shampoo_hypo", 80]] as const) {
      expect(groomingAddonPrice(code, price, "full")).toBe(0);
    }
  });
  it("charges standard treatments separately with Express", () => {
    expect(groomingAddonPrice("hygiene_cut", 50, "express")).toBe(50);
    expect(groomingAddonPrice("teeth_gel", 130, "express")).toBe(130);
  });
  it("keeps painted nails chargeable at R80 with Full grooming", () => {
    expect(groomingAddonPrice("painted_nails", 80, "full")).toBe(80);
  });
  it("keeps all Colour Pop options chargeable", () => {
    for (const [code, price] of [["colour_pop_ears", 100], ["colour_pop_ears_tail", 175], ["colour_pop_body", 300], ["colour_pop_designs", 450]] as const) {
      expect(groomingAddonPrice(code, price, "full")).toBe(price);
    }
  });
  it("charges R50 per extra 15-minute block after 60 minutes", () => {
    expect(mattedOvertimePrice(60, 50, 60)).toBe(0);
    expect(mattedOvertimePrice(75, 50, 60)).toBe(50);
    expect(mattedOvertimePrice(76, 50, 60)).toBe(100);
  });
  it("restricts pensioner discount to Monday and Wednesday", () => {
    expect(pensionerEligible(new Date(2026, 9, 19))).toBe(true);
    expect(pensionerEligible(new Date(2026, 9, 21))).toBe(true);
    expect(pensionerEligible(new Date(2026, 9, 20))).toBe(false);
  });
});