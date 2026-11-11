import { describe, expect, it } from "vitest";
import { billTotals } from "./billTotals";
describe("complete POS bill totals", () => {
  it("adds R92 retail to an existing R925 balance", () => {
    expect(billTotals({ total: 925, tax_total: 0, amount_paid: 0, balance_due: 925 }, [{ quantity: 1, unit_price: 92, vat_rate: 15 }], 0)).toEqual({ shopSubtotal: 92, shopTotal: 92, total: 1017, vat: 12, paid: 0, due: 1017 });
  });
  it("retains prior payments instead of charging the invoice total twice", () => {
    const t = billTotals({ total: 1000, tax_total: 100, amount_paid: 75, balance_due: 925 }, [{ quantity: 1, unit_price: 92, vat_rate: 15 }], 0);
    expect(t.total).toBe(1092); expect(t.due).toBe(1017); expect(t.paid).toBe(75); expect(t.vat).toBe(112);
  });
  it("matches the zero-VAT POS discount line and mixed VAT rates", () => {
    const t = billTotals(null, [{ quantity: 2, unit_price: 115, vat_rate: 15 }, { quantity: 1, unit_price: 50, vat_rate: 0 }], 10);
    expect(t.total).toBe(270); expect(t.due).toBe(270); expect(t.vat).toBe(30);
  });
});