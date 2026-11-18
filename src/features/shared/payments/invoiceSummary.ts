export interface DeskInvoice {
  id: string;
  invoice_number: string | null;
  customer_id: string;
  status: string;
  balance_due: number;
  total: number;
  due_date: string | null;
  shared?: boolean;
}
export function invoiceState(inv: Pick<DeskInvoice, "status" | "balance_due">) {
  if (inv.balance_due == null || !Number.isFinite(Number(inv.balance_due))) return "unavailable";
  if (["cancelled", "void"].includes(inv.status)) return "cancelled";
  if (inv.status === "draft") return "draft";
  if (inv.balance_due <= 0) return "paid";
  if (inv.status === "paid") return "unavailable";
  return "outstanding";
}
export function uniqueInvoices(invoices: DeskInvoice[]) {
  return [...new Map(invoices.map(inv => [inv.id, inv])).values()];
}
export function outstandingTotal(invoices: DeskInvoice[]) {
  return uniqueInvoices(invoices).filter(inv => invoiceState(inv) === "outstanding")
    .reduce((sum, inv) => sum + Math.round(Number(inv.balance_due) * 100), 0) / 100;
}
export function paymentRefreshKeys(tenantId: string, invoiceId: string, allocations: { invoice_id: string; amount: number }[] = []) {
  const ids = [...new Set([invoiceId, ...allocations.filter(a => a.amount > 0).map(a => a.invoice_id)])];
  return [...ids.map(id => ["invoice", tenantId, id]), ...["invoices", "payments", "customer-open-invoices", "booking_invoice", "desk-booking-invoices", "booking-payment-flags", "global-search", "customer_credit_balance", "customer_credit_ledger", "customer_aging"].map(key => [key])];
}
export function visitInvoiceState(invoices: DeskInvoice[]) {
  const rows = uniqueInvoices(invoices);
  if (!rows.length) return "none";
  const states = rows.map(invoiceState);
  if (states.includes("unavailable")) return "unavailable";
  if (states.includes("outstanding")) return "outstanding";
  if (states.includes("draft")) return "draft";
  if (states.every(s => s === "paid")) return "paid";
  return "cancelled";
}
export function collectionDestination(ready: boolean, inDaycare: boolean) {
  return !ready ? null : inDaycare ? "daycare" : "collection";
}
