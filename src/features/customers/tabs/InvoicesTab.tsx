import { Link } from "react-router-dom";
import { FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useInvoices } from "@/features/invoices/queries";
import { StatusBadge } from "@/components/ui/status-badge";

function money(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return `R${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvoicesTab({ tenantId, customerId }: { tenantId: string; customerId: string }) {
  const q = useInvoices(tenantId, { customerId });
  if (q.isLoading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices…
      </div>
    );
  if (q.isError)
    return <div className="text-sm text-sk-coral-dark">{(q.error as Error)?.message}</div>;
  if (!q.data?.length)
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <FileText className="h-5 w-5" /> No invoices yet.
      </div>
    );
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-sk-surface-muted text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Invoice</th>
            <th className="px-3 py-2 text-left font-medium">Period</th>
            <th className="px-3 py-2 text-left font-medium">Issue</th>
            <th className="px-3 py-2 text-left font-medium">Due</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 text-right font-medium">Paid</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {q.data.map((inv: any) => {
            const period = inv.billing_period_start
              ? format(new Date(inv.billing_period_start), "MMM yyyy")
              : null;
            return (
              <tr key={inv.id} className="hover:bg-sk-surface-muted/50">
                <td className="px-3 py-2">
                  <Link
                    to={`/admin/invoices/${inv.id}`}
                    className="font-medium text-sk-coral-dark hover:underline"
                  >
                    {inv.invoice_number ?? "—"}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{period ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {inv.issue_date ? format(new Date(inv.issue_date), "dd MMM yyyy") : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "—"}
                </td>
                <td className="px-3 py-2 text-right">{money(inv.total)}</td>
                <td className="px-3 py-2 text-right">{money(inv.amount_paid)}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={inv.status as any} label={inv.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}