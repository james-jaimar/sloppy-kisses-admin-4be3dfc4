import { describe, expect, it } from "vitest";
import { isImportedXeroHotelInvoice, legacyHotelGrossLines } from "../../../supabase/functions/_shared/legacyHotelImport";

describe("historical hotel import financial safeguards", () => {
  it("retains R5002.50 from net quote lines instead of treating R4350 as the total", () => {
    expect(legacyHotelGrossLines({ Total: 5002.5, SubTotal: 4350, TotalTax: 652.5, LineItems: [
      { LineAmount: 3895.65, TaxAmount: 584.35 },
      { LineAmount: 217.39, TaxAmount: 32.61 },
      { LineAmount: 236.96, TaxAmount: 35.54 },
    ] })).toEqual([4480, 250, 272.5]);
  });
  it("does not add VAT a second time to an inclusive R5785 invoice", () => {
    expect(legacyHotelGrossLines({ Total: 5785, SubTotal: 5030.43, TotalTax: 754.57,
      LineItems: [{ LineAmount: 5785, TaxAmount: 754.57 }],
    })).toEqual([5785]);
  });
  it("holds inconsistent document amounts instead of inventing a balancing charge", () => {
    expect(() => legacyHotelGrossLines({ Total: 645, SubTotal: 0, TotalTax: 0, LineItems: [] })).toThrow();
  });
  it("recognises existing linked hotel invoices for read-only Xero handling", () => {
    expect(isImportedXeroHotelInvoice({ xero_invoice_id: "existing-invoice", invoice_items: [{ source_type: "legacy_xero_hotel" }] })).toBe(true);
    expect(isImportedXeroHotelInvoice({ xero_invoice_id: null, invoice_items: [{ source_type: "legacy_xero_hotel" }] })).toBe(false);
    expect(isImportedXeroHotelInvoice({ xero_invoice_id: "existing-invoice", invoice_items: [{ source_type: "hotel_stay" }] })).toBe(false);
  });
});