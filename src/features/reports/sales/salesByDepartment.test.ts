import { describe, it, expect } from "vitest";
import { buildSalesReport, classifyLine, type SalesInvoice, type SalesLine } from "./salesByDepartment";

const line = (p: Partial<SalesLine>): SalesLine => ({ description: "x", line_total: 115, vat_amount: 15, quantity: 1, product_id: null, stock_movement_id: null, booking_service: null, ...p });
const inv = (lines: SalesLine[], p: Partial<SalesInvoice> = {}): SalesInvoice => ({ id: "i", invoice_number: "INV", issue_date: "2026-11-26", booking_service: null, lines, ...p });

describe("sales by department", () => {
  it("unlinked extra lines on a mobile invoice count as mobile grooming", () => {
    const i = inv([line({ booking_service: "grooming_mobile" }), line({ description: "Grooming — Nails" })]);
    expect(classifyLine(i.lines[1], i)).toBe("grooming_mobile");
  });
  it("till lines with no booking count as retail", () => {
    const i = inv([line({ description: "Cooldrink - Coke" })]);
    expect(classifyLine(i.lines[0], i)).toBe("retail");
  });
  it("hotel cat and dog both go to Hotel & Cattery", () => {
    const i = inv([line({ booking_service: "hotel_cat" }), line({ booking_service: "hotel_dog" })]);
    expect(buildSalesReport([i], []).byDept.hotel.gross).toBe(230);
  });
  it("credit notes deduct VAT-inclusive from the reversed invoice's department", () => {
    const i = inv([line({ booking_service: "grooming_inhouse", line_total: 545, vat_amount: 71.09 })]);
    const r = buildSalesReport([], [{ id: "c", issue_date: "2026-11-27", total: 545, invoice: i }]);
    expect(r.byDept.grooming_inhouse.credits).toBe(545);
    expect(r.byDept.grooming_inhouse.creditVat).toBe(71.09);
    expect(r.byDay.get("2026-11-27")!.grooming_inhouse).toBe(-545);
  });
});
