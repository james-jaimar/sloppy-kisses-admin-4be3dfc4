import { describe, expect, it } from "vitest";
import { collectionDestination, visitInvoiceState, invoiceState, outstandingTotal, paymentRefreshKeys, uniqueInvoices, type DeskInvoice } from "./invoiceSummary";
const inv: DeskInvoice = { id: "shared", customer_id: "customer", invoice_number: "INV1", status: "sent", balance_due: 250, total: 500, due_date: null };
describe("front desk financial rules", () => {
  it("does not infer payment from a missing invoice", () => { expect(visitInvoiceState([])).toBe("none"); });
  it("keeps draft invoices visible even beside a settled invoice", () => { expect(visitInvoiceState([{ ...inv, balance_due: 0 }, { ...inv, id: "draft", status: "draft", balance_due: 0 }])).toBe("draft"); });
  it("keeps collection readiness independent from payment", () => { expect(collectionDestination(false, false)).toBeNull(); expect(collectionDestination(true, false)).toBe("collection"); expect(invoiceState(inv)).toBe("outstanding"); });
  it("returns daycare dogs to daycare rather than collection", () => { expect(collectionDestination(true, true)).toBe("daycare"); });
  it("counts a shared invoice only once", () => { expect(uniqueInvoices([inv, inv])).toHaveLength(1); expect(outstandingTotal([inv, inv])).toBe(250); });
  it("never treats an unissued zero balance as paid", () => { expect(invoiceState({ status: "draft", balance_due: 0 })).toBe("draft"); });
  it("does not count cancelled debt as payable", () => { expect(outstandingTotal([{ ...inv, status: "cancelled" }])).toBe(0); });
  it("retains partial outstanding balances", () => { expect(invoiceState({ status: "part_paid", balance_due: 250 })).toBe("outstanding"); });
  it("refreshes every positive allocation and shared screens", () => { const keys = paymentRefreshKeys("tenant", "one", [{ invoice_id: "two", amount: 100 }, { invoice_id: "three", amount: 0 }]); expect(keys).toContainEqual(["invoice", "tenant", "two"]); expect(keys).not.toContainEqual(["invoice", "tenant", "three"]); expect(keys).toContainEqual(["desk-booking-invoices"]); expect(keys).toContainEqual(["global-search"]); });
});
