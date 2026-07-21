import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useRevenueInvoices, type RevenueRow } from "./queries";
import { fmtZar } from "@/features/invoices/status";
import { Download, Loader2 } from "lucide-react";

function firstOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString().slice(0, 10);
}
function lastOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString().slice(0, 10);
}

function toCsv(rows: RevenueRow[]) {
  const header = ["Invoice", "Date", "Customer", "Status", "Subtotal", "Discount", "VAT", "Total", "Paid"];
  const body = rows.map((r) => [
    r.invoice_number ?? "",
    r.issue_date ?? "",
    r.customer_name ?? "",
    r.status,
    r.subtotal.toFixed(2),
    r.discount_total.toFixed(2),
    r.tax_total.toFixed(2),
    r.total.toFixed(2),
    r.amount_paid.toFixed(2),
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [header.join(","), ...body].join("\n");
}

export default function RevenueReportPage() {
  const { tenant } = useCurrentTenant();
  const today = new Date();
  const [from, setFrom] = useState(firstOfMonth(new Date(today.getUTCFullYear(), today.getUTCMonth() - 5, 1)));
  const [to, setTo] = useState(lastOfMonth(today));
  const q = useRevenueInvoices(tenant?.id ?? null, from, to);
  const rows = q.data ?? [];

  const totals = useMemo(() => rows.reduce((a, r) => ({
    subtotal: a.subtotal + r.subtotal,
    discount_total: a.discount_total + r.discount_total,
    tax_total: a.tax_total + r.tax_total,
    total: a.total + r.total,
    amount_paid: a.amount_paid + r.amount_paid,
    outstanding: a.outstanding + (r.total - r.amount_paid),
  }), { subtotal: 0, discount_total: 0, tax_total: 0, total: 0, amount_paid: 0, outstanding: 0 }), [rows]);

  const byMonth = useMemo(() => {
    const m = new Map<string, { net: number; vat: number; total: number; count: number }>();
    for (const r of rows) {
      if (!r.issue_date) continue;
      const key = r.issue_date.slice(0, 7);
      const b = m.get(key) ?? { net: 0, vat: 0, total: 0, count: 0 };
      b.net += r.subtotal - r.discount_total;
      b.vat += r.tax_total;
      b.total += r.total;
      b.count += 1;
      m.set(key, b);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const byCustomer = useMemo(() => {
    const m = new Map<string, { name: string; total: number; count: number; id: string | null }>();
    for (const r of rows) {
      const key = r.customer_id ?? "unknown";
      const b = m.get(key) ?? { name: r.customer_name ?? "—", total: 0, count: 0, id: r.customer_id };
      b.total += r.total;
      b.count += 1;
      m.set(key, b);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [rows]);

  function downloadCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `revenue-${from}-to-${to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <AppHeader title="Revenue" subtitle="Invoiced revenue by month and top customers"
        actions={
          <button onClick={downloadCsv} disabled={rows.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        } />
      <div className="space-y-4 p-6">
        <div className="sk-card flex flex-wrap items-end gap-3 p-4">
          <label className="flex flex-col text-xs text-muted-foreground">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 h-10 rounded-xl border border-border bg-white px-2 text-sm" />
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 h-10 rounded-xl border border-border bg-white px-2 text-sm" />
          </label>
          <div className="ml-auto text-xs text-muted-foreground">
            Excludes drafts & voided invoices. Uses issue date.
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Kpi label="Invoiced (gross)" value={fmtZar(totals.total)} />
          <Kpi label="Net (ex VAT)" value={fmtZar(totals.subtotal - totals.discount_total)} />
          <Kpi label="VAT" value={fmtZar(totals.tax_total)} />
          <Kpi label="Outstanding" value={fmtZar(totals.outstanding)} tone="warn" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="sk-card overflow-hidden">
            <div className="border-b border-border px-4 py-3 font-semibold">By month</div>
            <table className="w-full text-sm">
              <thead className="bg-sk-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-2">Month</th><th className="px-4 py-2 text-right">Invoices</th><th className="px-4 py-2 text-right">Net</th><th className="px-4 py-2 text-right">VAT</th><th className="px-4 py-2 text-right">Gross</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>}
                {!q.isLoading && byMonth.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No invoices in range.</td></tr>
                )}
                {byMonth.map(([key, b]) => (
                  <tr key={key}>
                    <td className="px-4 py-2">{key}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtZar(b.net)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtZar(b.vat)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtZar(b.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sk-card overflow-hidden">
            <div className="border-b border-border px-4 py-3 font-semibold">Top 10 customers</div>
            <table className="w-full text-sm">
              <thead className="bg-sk-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-2">Customer</th><th className="px-4 py-2 text-right">Invoices</th><th className="px-4 py-2 text-right">Gross</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byCustomer.length === 0 && !q.isLoading && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No customers.</td></tr>
                )}
                {byCustomer.map((c) => (
                  <tr key={c.id ?? c.name}>
                    <td className="px-4 py-2">
                      {c.id ? (
                        <Link to={`/admin/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                      ) : <span>{c.name}</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtZar(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="sk-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={"mt-1 text-xl font-semibold tabular-nums " + (tone === "warn" ? "text-sk-coral-dark" : "")}>{value}</div>
    </div>
  );
}