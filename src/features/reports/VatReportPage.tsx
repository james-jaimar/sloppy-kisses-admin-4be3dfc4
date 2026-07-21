import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useVatLines, vatPeriods, type VatLine } from "./queries";
import { fmtZar } from "@/features/invoices/status";
import { Download, Loader2 } from "lucide-react";
import { format } from "date-fns";

function toCsv(rows: VatLine[]) {
  const header = ["Invoice", "Date", "Customer", "VAT rate %", "Net", "VAT", "Gross"];
  const body = rows.map((r) => [
    r.invoice_number ?? "",
    r.issue_date ?? "",
    r.customer_name ?? "",
    r.vat_rate.toFixed(2),
    r.net.toFixed(2),
    r.vat.toFixed(2),
    r.gross.toFixed(2),
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [header.join(","), ...body].join("\n");
}

export default function VatReportPage() {
  const { tenant } = useCurrentTenant();
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [category, setCategory] = useState<"A" | "B">("A");
  const periods = useMemo(() => vatPeriods(year, category), [year, category]);
  // default to the period containing today, else the most recent past
  const defaultIdx = Math.max(
    0,
    periods.findIndex((p) => now.toISOString().slice(0, 10) <= p.to && now.toISOString().slice(0, 10) >= p.from),
  );
  const [idx, setIdx] = useState(defaultIdx);
  const period = periods[idx] ?? periods[0];

  const q = useVatLines(tenant?.id ?? null, period.from, period.to);
  const rows = q.data ?? [];

  const byRate = useMemo(() => {
    const m = new Map<number, { net: number; vat: number; gross: number; count: number }>();
    for (const r of rows) {
      const b = m.get(r.vat_rate) ?? { net: 0, vat: 0, gross: 0, count: 0 };
      b.net += r.net; b.vat += r.vat; b.gross += r.gross; b.count += 1;
      m.set(r.vat_rate, b);
    }
    return Array.from(m.entries()).sort(([a], [b]) => b - a);
  }, [rows]);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    net: a.net + r.net, vat: a.vat + r.vat, gross: a.gross + r.gross,
  }), { net: 0, vat: 0, gross: 0 }), [rows]);

  function downloadCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vat-${period.from}-to-${period.to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }

  const years = [now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1];

  return (
    <>
      <AppHeader title="VAT report" subtitle="Bi-monthly output VAT summary (SARS-ready)"
        actions={
          <button onClick={downloadCsv} disabled={rows.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        } />
      <div className="space-y-4 p-6">
        <div className="sk-card flex flex-wrap items-end gap-3 p-4">
          <label className="flex flex-col text-xs text-muted-foreground">
            Year
            <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setIdx(0); }}
              className="mt-1 h-10 rounded-xl border border-border bg-white px-2 text-sm">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            SARS category
            <select value={category} onChange={(e) => { setCategory(e.target.value as "A" | "B"); setIdx(0); }}
              className="mt-1 h-10 rounded-xl border border-border bg-white px-2 text-sm">
              <option value="A">Category A (Jan-Feb, Mar-Apr, …)</option>
              <option value="B">Category B (Feb-Mar, Apr-May, …)</option>
            </select>
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            Period
            <select value={idx} onChange={(e) => setIdx(Number(e.target.value))}
              className="mt-1 h-10 rounded-xl border border-border bg-white px-2 text-sm">
              {periods.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
            </select>
          </label>
          <div className="ml-auto text-xs text-muted-foreground">
            {format(new Date(period.from + "T00:00:00Z"), "dd MMM yyyy")} – {format(new Date(period.to + "T00:00:00Z"), "dd MMM yyyy")}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Kpi label="Taxable supplies (Net)" value={fmtZar(totals.net)} />
          <Kpi label="Output VAT" value={fmtZar(totals.vat)} tone="accent" />
          <Kpi label="Gross invoiced" value={fmtZar(totals.gross)} />
        </div>

        <div className="sk-card overflow-hidden">
          <div className="border-b border-border px-4 py-3 font-semibold">By VAT rate</div>
          <table className="w-full text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2">Rate</th><th className="px-4 py-2 text-right">Lines</th><th className="px-4 py-2 text-right">Net</th><th className="px-4 py-2 text-right">VAT</th><th className="px-4 py-2 text-right">Gross</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {byRate.length === 0 && !q.isLoading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No invoices in this period.</td></tr>
              )}
              {byRate.map(([rate, b]) => (
                <tr key={rate}>
                  <td className="px-4 py-2 font-medium">{rate.toFixed(2)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums">{b.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtZar(b.net)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtZar(b.vat)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtZar(b.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sk-card overflow-hidden">
          <div className="border-b border-border px-4 py-3 font-semibold">Per invoice</div>
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-sk-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Invoice</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-right">Net</th>
                  <th className="px-4 py-2 text-right">VAT</th>
                  <th className="px-4 py-2 text-right">Gross</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>}
                {!q.isLoading && rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Nothing to report.</td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={`${r.invoice_id}-${r.vat_rate}-${i}`}>
                    <td className="px-4 py-2">
                      <Link to={`/admin/invoices/${r.invoice_id}`} className="font-medium hover:underline">{r.invoice_number ?? "—"}</Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {r.issue_date ? format(new Date(r.issue_date + "T00:00:00Z"), "dd MMM yyyy") : "—"}
                    </td>
                    <td className="px-4 py-2">{r.customer_name ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.vat_rate.toFixed(2)}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtZar(r.net)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtZar(r.vat)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtZar(r.gross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Based on invoice issue date. Excludes draft and voided invoices. Input VAT (purchases) is tracked in Xero.
        </p>
      </div>
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "accent" }) {
  return (
    <div className="sk-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={"mt-1 text-xl font-semibold tabular-nums " + (tone === "accent" ? "text-sk-coral-dark" : "")}>{value}</div>
    </div>
  );
}