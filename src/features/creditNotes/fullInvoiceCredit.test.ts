import { describe, expect, it } from "vitest";
import { fullInvoiceCreditLines } from "./fullInvoiceCredit";

describe("full invoice VAT credits", () => {
  it("reverses R473.91 net plus R71.09 VAT as R545", () => {
    expect(fullInvoiceCreditLines([{ description: "Grooming", line_total: 473.91, vat_amount: 71.09 }]))
      .toEqual([{ description: "Grooming", quantity: 1, unit_price: 545 }]);
  });
  it("uses discounted line totals rather than undiscounted unit prices", () => {
    expect(fullInvoiceCreditLines([{ description: "Discounted service", line_total: 200, vat_amount: 30 }])[0].unit_price).toBe(230);
  });
  it("preserves zero VAT lines", () => {
    expect(fullInvoiceCreditLines([{ description: "Zero VAT", line_total: 100, vat_amount: 0 }])[0].unit_price).toBe(100);
  });
});