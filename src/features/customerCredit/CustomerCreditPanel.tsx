import { useState } from "react";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useCustomerCreditBalance, useCustomerCreditLedger } from "./queries";
import { CreditAdjustmentDialog } from "./CreditAdjustmentDialog";
import { fmtZar } from "@/features/invoices/status";
import { Link } from "react-router-dom";

const LABELS: Record<string, string> = {
  overpayment: "Overpayment",
  manual_adjustment: "Manual adjustment",
  credit_note_unapplied: "Unapplied credit note",
  allocation: "Applied to invoice",
  refund_out: "Refunded out",
};

export function CustomerCreditPanel({
  tenantId, customerId,
}: { tenantId: string; customerId: string }) {
  const { hasPermission, profile } = useCurrentUser();
  const isPlatform = profile?.user_type === "platform";
  const canAdjust = isPlatform || hasPermission("customer_credit.adjust");
  const balQ = useCustomerCreditBalance(tenantId, customerId);
  const rowsQ = useCustomerCreditLedger(tenantId, customerId);
  const [adjOpen, setAdjOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Available credit</div>
          <div className="text-2xl font-semibold tabular-nums">{fmtZar(balQ.data ?? 0)}</div>
        </div>
        {canAdjust && (
          <button onClick={() => setAdjOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
            <Plus className="h-3.5 w-3.5" /> Adjust credit
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Reference</th>
              <th className="px-4 py-2">Notes</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rowsQ.isLoading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</td></tr>
            )}
            {!rowsQ.isLoading && (rowsQ.data?.length ?? 0) === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">No credit activity yet.</td></tr>
            )}
            {rowsQ.data?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 whitespace-nowrap">{format(new Date(r.entry_date), "dd MMM yyyy")}</td>
                <td className="px-4 py-2">{LABELS[r.entry_type] ?? r.entry_type}</td>
                <td className="px-4 py-2 text-xs">
                  {r.source_invoice_id && (
                    <Link to={`/admin/invoices/${r.source_invoice_id}`} className="text-sk-coral-dark hover:underline">Invoice</Link>
                  )}
                  {r.source_credit_note_id && (
                    <Link to={`/admin/credit-notes/${r.source_credit_note_id}`} className="text-sk-coral-dark hover:underline">Credit note</Link>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{r.notes ?? "—"}</td>
                <td className={"px-4 py-2 text-right tabular-nums font-semibold " + (r.amount < 0 ? "text-muted-foreground" : "text-sk-green")}>
                  {r.amount >= 0 ? "+" : ""}{fmtZar(r.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adjOpen && (
        <CreditAdjustmentDialog tenantId={tenantId} customerId={customerId} onClose={() => setAdjOpen(false)} />
      )}
    </div>
  );
}