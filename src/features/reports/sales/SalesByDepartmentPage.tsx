import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { addDays, eachDayOfInterval, endOfMonth, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { fmtZar } from "@/features/invoices/status";
import { downloadSheetPdf, PdfButton, pdfDay } from "@/features/lists/sheetPdf";
import { useSalesData } from "./useSalesData";
import { buildSalesReport, DEPARTMENTS, takings } from "./salesByDepartment";

type Preset = "today" | "yesterday" | "week" | "month" | "last_month" | "custom";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "week", label: "This week" },
  { key: "month", label: "This month" }, { key: "last_month", label: "Last month" }, { key: "custom", label: "Custom" },
];

function range(p: Preset, from?: string | null, to?: string | null) {
  const now = new Date();
  switch (p) {
    case "yesterday": { const y = pdfDay(addDays(now, -1)); return [y, y]; }
    case "week": { const s = startOfWeek(now, { weekStartsOn: 1 }); return [pdfDay(s), pdfDay(addDays(s, 6))]; }
    case "month": return [pdfDay(startOfMonth(now)), pdfDay(endOfMonth(now))];
    case "last_month": { const m = subMonths(now, 1); return [pdfDay(startOfMonth(m)), pdfDay(endOfMonth(m))]; }
    case "custom": return [from || pdfDay(now), to || from || pdfDay(now)];
    default: return [pdfDay(now), pdfDay(now)];
  }
}
const d = (iso: string) => format(new Date(iso + "T00:00:00"), "dd MMM yyyy");
const money = (n: number) => n.toFixed(2);

export default function SalesByDepartmentPage() {
  const { tenant } = useCurrentTenant();
  const [sp, setSp] = useSearchParams();
  const preset = (sp.get("p") as Preset) || "today";
  const [from, to] = range(preset, sp.get("from"), sp.get("to"));
  const q = useSalesData(tenant?.id, from, to);
  const report = useMemo(() => buildSalesReport(q.data?.invoices ?? [], q.data?.credits ?? []), [q.data]);
  const multiDay = from !== to;
  const days = useMemo(() => multiDay ? eachDayOfInterval({ start: new Date(from + "T00:00:00"), end: new Date(to + "T00:00:00") }).map(pdfDay) : [], [from, to, multiDay]);
  const shown = DEPARTMENTS.filter((x) => x.key !== "other" || report.byDept.other.gross || report.byDept.other.credits);
  const total = takings(report.totals);
  const period = multiDay ? `${d(from)} – ${d(to)}` : d(from);

  const setPreset = (p: Preset) => { const n = new URLSearchParams(sp); n.set("p", p); if (p === "custom") { n.set("from", from); n.set("to", to); } else { n.delete("from"); n.delete("to"); } setSp(n, { replace: true }); };
  const setDate = (k: "from" | "to", v: string) => { const n = new URLSearchParams(sp); n.set("p", "custom"); n.set("from", from); n.set("to", to); n.set(k, v); setSp(n, { replace: true }); };

  const summaryRows = shown.map((x) => { const t = report.byDept[x.key]; const k = takings(t); return [x.label, String(t.count), money(t.gross), money(t.credits), money(k.net), money(k.vat), money(k.gross)]; });
  const summaryTotal = ["Total", String(report.totals.count), money(report.totals.gross), money(report.totals.credits), money(total.net), money(total.vat), money(total.gross)];

  function csv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [`Sales by department,${esc(period)}`, "", ["Department", "Items", "Invoiced (incl. VAT)", "Credits (incl. VAT)", "Net sales (excl. VAT)", "VAT", "Gross takings"].join(","),
      ...[...summaryRows, summaryTotal].map((r) => r.map(esc).join(","))];
    if (multiDay) {
      lines.push("", ["Date", ...shown.map((x) => x.label), "Total"].map(esc).join(","));
      for (const day of days) { const row = report.byDay.get(day); const vals = shown.map((x) => row?.[x.key] ?? 0); lines.push([day, ...vals.map(money), money(vals.reduce((a, b) => a + b, 0))].map(esc).join(",")); }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `sales-by-department-${from}-to-${to}.csv`; document.body.appendChild(a); a.click(); a.remove();
  }

  async function pdf() {
    const sections = [{ heading: "Sales by department", columns: [{ label: "Department", width: 52 }, { label: "Items" }, { label: "Invoiced" }, { label: "Credits" }, { label: "Net excl. VAT" }, { label: "VAT" }, { label: "Gross takings" }], rows: [...summaryRows, summaryTotal], footer: "Amounts in ZAR. Invoiced and credits include VAT. Based on invoice and credit note dates; drafts and voided invoices excluded." }];
    if (multiDay) sections.push({ heading: "Daily takings by department", columns: [{ label: "Date", width: 24 }, ...shown.map((x) => ({ label: x.label })), { label: "Total" }], rows: days.map((day) => { const row = report.byDay.get(day); const vals = shown.map((x) => row?.[x.key] ?? 0); return [format(new Date(day + "T00:00:00"), "EEE dd MMM"), ...vals.map(money), money(vals.reduce((a, b) => a + b, 0))]; }), footer: "Gross takings incl. VAT, after credit notes." } as any);
    await downloadSheetPdf({ title: "Sales by department", subtitle: `${tenant?.name ?? ""} · ${period}`, landscape: multiDay, sections, fileName: `sales-by-department-${from}-to-${to}.pdf` });
  }

  return (
    <>
      <AppHeader title="Sales by department" subtitle="Daily, weekly and monthly takings per business area"
        actions={<div className="flex items-center gap-2">
          <button onClick={csv} disabled={q.isLoading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"><Download className="h-4 w-4" /> Export CSV</button>
          <div className="[&>button]:mb-0"><PdfButton onClick={pdf} disabled={q.isLoading} /></div>
        </div>} />
      <div className="space-y-4 p-6">
        <div className="sk-card flex flex-wrap items-end gap-2 p-4">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={"h-10 rounded-xl border px-4 text-sm font-semibold " + (preset === p.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>{p.label}</button>
          ))}
          {preset === "custom" && <>
            <input type="date" value={from} onChange={(e) => setDate("from", e.target.value)} className="h-10 rounded-xl border border-border bg-card px-2 text-sm" aria-label="From" />
            <input type="date" value={to} min={from} onChange={(e) => setDate("to", e.target.value)} className="h-10 rounded-xl border border-border bg-card px-2 text-sm" aria-label="To" />
          </>}
          <div className="ml-auto text-sm font-medium text-muted-foreground">{period}</div>
        </div>

        {q.isLoading ? <div className="sk-card p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        : q.error ? <div className="sk-card p-6 text-sm text-destructive">Couldn't load sales. Please refresh and try again.</div>
        : <>
          <div className="grid gap-3 md:grid-cols-4">
            <Kpi label="Gross takings (incl. VAT)" value={fmtZar(total.gross)} strong />
            <Kpi label="Net sales (excl. VAT)" value={fmtZar(total.net)} />
            <Kpi label="VAT" value={fmtZar(total.vat)} />
            <Kpi label="Credit notes" value={report.totals.credits ? `−${fmtZar(report.totals.credits)}` : fmtZar(0)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((x) => { const t = report.byDept[x.key]; const k = takings(t); return (
              <div key={x.key} className="sk-card p-4">
                <div className="text-sm font-semibold">{x.label}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{fmtZar(k.gross)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.count} items · net {fmtZar(k.net)} · VAT {fmtZar(k.vat)}{t.credits ? ` · credits −${fmtZar(t.credits)}` : ""}</div>
              </div>); })}
          </div>

          <div className="sk-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>{["Department", "Items", "Invoiced", "Credits", "Net excl. VAT", "VAT", "Gross takings"].map((h, i) => <th key={h} className={"px-4 py-2 " + (i ? "text-right" : "")}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...summaryRows, summaryTotal].map((r, ri) => (
                  <tr key={r[0]} className={ri === summaryRows.length ? "bg-muted font-bold" : ""}>
                    {r.map((c, i) => <td key={i} className={"px-4 py-2 " + (i ? "text-right tabular-nums" : "font-medium")}>{i >= 2 ? (i === 3 && Number(c) ? `−${fmtZar(Number(c))}` : fmtZar(Number(c))) : c}</td>)}
                  </tr>))}
              </tbody>
            </table>
          </div>

          {multiDay && <div className="sk-card overflow-x-auto">
            <div className="border-b border-border px-4 py-3 font-semibold">Day by day (gross takings incl. VAT)</div>
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-2">Date</th>{shown.map((x) => <th key={x.key} className="px-4 py-2 text-right">{x.label}</th>)}<th className="px-4 py-2 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {days.map((day) => { const row = report.byDay.get(day); const vals = shown.map((x) => row?.[x.key] ?? 0); return (
                  <tr key={day}><td className="px-4 py-2 font-medium">{format(new Date(day + "T00:00:00"), "EEE dd MMM")}</td>
                    {vals.map((v, i) => <td key={i} className="px-4 py-2 text-right tabular-nums">{v ? fmtZar(v) : "—"}</td>)}
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{fmtZar(vals.reduce((a, b) => a + b, 0))}</td></tr>); })}
              </tbody>
            </table>
          </div>}

          <p className="text-xs text-muted-foreground">Based on invoice date (the day each invoice was issued) and credit note date. Drafts and voided invoices are excluded. Credit notes are deducted from the department of the invoice they reverse.</p>
        </>}
      </div>
    </>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="sk-card p-4"><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div className={"mt-1 tabular-nums " + (strong ? "text-3xl font-bold text-primary" : "text-xl font-semibold")}>{value}</div></div>;
}
