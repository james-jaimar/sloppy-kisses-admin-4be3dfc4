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
  it("service date counts a Friday groom invoiced on Monday on Friday, not Monday", () => {
    const i = inv([line({ booking_service: "grooming_inhouse", service_date: "2026-11-27" })], { issue_date: "2026-11-23" });
    const svc = buildSalesReport([i], [], { basis: "service", from: "2026-11-27", to: "2026-11-27" });
    expect(svc.byDept.grooming_inhouse.gross).toBe(115);
    expect(svc.byDay.get("2026-11-27")!.grooming_inhouse).toBe(115);
    const mon = buildSalesReport([i], [], { basis: "service", from: "2026-11-23", to: "2026-11-23" });
    expect(mon.totals.gross).toBe(0);
    expect(buildSalesReport([i], [], { basis: "invoice" }).byDay.get("2026-11-23")!.grooming_inhouse).toBe(115);
  });
  it("service date keeps till sales on their sale day and credits on the reversed service day", () => {
    const till = inv([line({ description: "Coke" })], { id: "t", issue_date: "2026-11-27" });
    const g = inv([line({ booking_service: "grooming_mobile", service_date: "2026-11-27" })], { id: "g", issue_date: "2026-11-20" });
    const r = buildSalesReport([till, g], [{ id: "c", issue_date: "2026-11-30", total: 115, invoice: g }], { basis: "service", from: "2026-11-27", to: "2026-11-27" });
    expect(r.byDept.retail.gross).toBe(115);
    expect(r.byDept.grooming_mobile.credits).toBe(115);
    expect(r.byDay.get("2026-11-27")!.grooming_mobile).toBe(0);
  });
});
