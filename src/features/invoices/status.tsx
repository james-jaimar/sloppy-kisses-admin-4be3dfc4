import type { Database } from "@/integrations/supabase/types";

export type InvoiceStatus = Database["public"]["Enums"]["billing_status"];

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  issued: "Issued",
  part_paid: "Part paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Void",
  accepted: "Accepted",
  expired: "Expired",
};

export const INVOICE_STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-sk-turquoise-soft text-sk-turquoise-dark",
  issued: "bg-sk-turquoise-soft text-sk-turquoise-dark",
  part_paid: "bg-sk-orange-soft text-sk-orange",
  paid: "bg-sk-green-soft text-sk-green",
  overdue: "bg-sk-coral-soft text-sk-coral-dark",
  cancelled: "bg-muted text-muted-foreground line-through",
  accepted: "bg-sk-turquoise-soft text-sk-turquoise-dark",
  expired: "bg-muted text-muted-foreground",
};

export function InvoiceStatusChip({ status }: { status: string }) {
  const tone = INVOICE_STATUS_TONE[status] ?? "bg-muted text-muted-foreground";
  const label = INVOICE_STATUS_LABEL[status] ?? status;
  return (
    <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " + tone}>
      {label}
    </span>
  );
}

export function fmtZar(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return "R " + v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Compute the effective status of an invoice from amounts/dates.
 *  Uses stored status but promotes to overdue/paid/part_paid if amounts imply it. */
export function effectiveInvoiceStatus(inv: {
  status: string;
  total: number | null;
  amount_paid: number | null;
  due_date: string | null;
}): string {
  const total = Number(inv.total ?? 0);
  const paid = Number(inv.amount_paid ?? 0);
  if (inv.status === "draft" || inv.status === "cancelled") return inv.status;
  if (total > 0 && paid >= total) return "paid";
  if (paid > 0 && paid < total) return "part_paid";
  if (inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10)) return "overdue";
  return inv.status || "sent";
}