import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useAgingReport, type AgingRow } from "@/features/customerCredit/queries";
import { fmtZar } from "@/features/invoices/status";
import { Download, Loader2 } from "lucide-react";

function toCsv(rows: AgingRow[]): string {
  const header = ["Customer number","Customer","Email","Current","1-30","31-60","61-90","90+","Total due","Credit balance","Net due"];
  const body = rows.map((r) => [
    r.customer_number ?? "",
    r.customer_name ?? "",
    r.customer_email ?? "",
    r.current_bucket.toFixed(2),
    r.days_1_30.toFixed(2),
    r.days_31_60.toFixed(2),
    r.days_61_90.toFixed(2),
    r.days_over_90.toFixed(2),
    r.total_due.toFixed(2),
    r.credit_balance.toFixed(2),
    r.net_due.toFixed(2),
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [header.join(","), ...body].join("\n");
}

export default function AgingReportPage() {
  const { tenant } = useCurrentTenant();
  const q = useAgingReport(tenant?.id ?? null);
  const rows = q.data ?? [];
  const totals = useMemo(() => rows.reduce((acc, r) => ({
    current_bucket: acc.current_bucket + r.current_bucket,
    days_1_30: acc.days_1_30 + r.days_1_30,
    days_31_60: acc.days_31_60 + r.days_31_60,
    days_61_90: acc.days_61_90 + r.days_61_90,
    days_over_90: acc.days_over_90 + r.days_over_90,
    total_due: acc.total_due + r.total_due,
    credit_balance: acc.credit_balance + r.credit_balance,
    net_due: acc.net_due + r.net_due,
  }), { current_bucket:0, days_1_30:0, days_31_60:0, days_61_90:0, days_over_90:0, total_due:0, credit_balance:0, net_due:0 }), [rows]);

  function downloadCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `debtors-aging-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <AppHeader title="Debtors aging" subtitle="Outstanding invoices bucketed by age"
        actions={
          <button onClick={downloadCsv} disabled={rows.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        } />
      <div className="p-6">
        <div className="sk-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2 text-right">Current</th>
                <th className="px-4 py-2 text-right">1–30</th>
                <th className="px-4 py-2 text-right">31–60</th>
                <th className="px-4 py-2 text-right">61–90</th>
                <th className="px-4 py-2 text-right">90+</th>
                <th className="px-4 py-2 text-right">Total due</th>
                <th className="px-4 py-2 text-right">Credit</th>
                <th className="px-4 py-2 text-right">Net due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.isLoading && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>
              )}
              {!q.isLoading && rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nobody currently owes money. 🎉
                </td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.customer_id}>
                  <td className="px-4 py-2">
                    <Link to={`/admin/customers/${r.customer_id}`} className="font-medium hover:underline">
                      {r.customer_name ?? "—"}
                    </Link>
                    {r.customer_number && (
                      <div className="text-[11px] text-muted-foreground">#{r.customer_number}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtZar(r.current_bucket)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtZar(r.days_1_30)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtZar(r.days_31_60)}</td>
                  <td className={"px-4 py-2 text-right tabular-nums " + (r.days_61_90 > 0 ? "text-sk-coral-dark" : "")}>{fmtZar(r.days_61_90)}</td>
                  <td className={"px-4 py-2 text-right tabular-nums " + (r.days_over_90 > 0 ? "text-sk-coral-dark font-semibold" : "")}>{fmtZar(r.days_over_90)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtZar(r.total_due)}</td>
                  <td className={"px-4 py-2 text-right tabular-nums " + (r.credit_balance > 0 ? "text-sk-green" : "text-muted-foreground")}>
                    {r.credit_balance > 0 ? fmtZar(r.credit_balance) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtZar(r.net_due)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-sk-surface-muted text-sm font-semibold">
                <tr>
                  <td className="px-4 py-2">Total ({rows.length} customers)</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtZar(totals.current_bucket)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtZar(totals.days_1_30)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtZar(totals.days_31_60)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtZar(totals.days_61_90)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtZar(totals.days_over_90)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtZar(totals.total_due)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtZar(totals.credit_balance)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtZar(totals.net_due)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  );
}