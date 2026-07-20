import { Fragment, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, FileText, Search, ArrowUpDown, ArrowUp, ArrowDown, Download, Send, CheckCircle2, Ban, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useInvoices, useAllPayments, useIssueInvoice, useVoidInvoice, useUpdateInvoice, useInvoicingSettings, useSendInvoiceEmail } from "./queries";
import { InvoiceStatusChip, fmtZar } from "./status";
import { NewInvoiceDrawer } from "./NewInvoiceDrawer";
import { format, parseISO } from "date-fns";
import { Can } from "@/components/auth/Can";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

type SortKey = "invoice_number" | "customer" | "issue_date" | "due_date" | "total" | "amount_paid" | "balance_due" | "status";
type SortDir = "asc" | "desc";
type GroupBy = "flat" | "customer" | "month";

const STATUS_OPTIONS: { code: string; label: string }[] = [
  { code: "draft", label: "Draft" },
  { code: "sent", label: "Sent" },
  { code: "part_paid", label: "Part paid" },
  { code: "paid", label: "Paid" },
  { code: "overdue", label: "Overdue" },
];

function toIsoDay(d: Date) { return d.toISOString().slice(0, 10); }
function startOfThisMonth() { const d = new Date(); d.setDate(1); return toIsoDay(d); }
function todayIso() { return toIsoDay(new Date()); }
function daysBetween(a: string, b: string) {
  return Math.floor((parseISO(b).getTime() - parseISO(a).getTime()) / (1000 * 60 * 60 * 24));
}
function csvEscape(v: any) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCsv(name: string, rows: string[][]) {
  const blob = new Blob([rows.map((r) => r.map(csvEscape).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function InvoicesListPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "invoices";
  const confirm = useConfirm();

  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  // URL-persisted filters (saved views live in the URL)
  const statusesCsv = params.get("statuses") ?? "";
  const activeStatuses = statusesCsv ? statusesCsv.split(",").filter(Boolean) : [];
  const unpaidOnly = params.get("unpaid") === "1";
  const includeVoided = params.get("voided") === "1";
  const q = params.get("q") ?? "";
  const dateField = (params.get("dateField") as "issue_date" | "due_date") || "issue_date";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const period = params.get("period") ?? "";
  const groupBy = (params.get("group") as GroupBy) || "flat";
  const sortKey = (params.get("sort") as SortKey) || "issue_date";
  const sortDir = (params.get("dir") as SortDir) || "desc";
  // Payments tab filters
  const pMethod = params.get("pMethod") ?? "";
  const pFrom = params.get("pFrom") ?? "";
  const pTo = params.get("pTo") ?? "";
  const pQ = params.get("pQ") ?? "";
  const pSort = (params.get("pSort") as "paid_at" | "amount" | "payment_method") || "paid_at";
  const pDir = (params.get("pDir") as SortDir) || "desc";

  const setP = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  const toggleStatus = (code: string) => {
    const set = new Set(activeStatuses);
    set.has(code) ? set.delete(code) : set.add(code);
    setP({ statuses: Array.from(set).join(",") || null });
  };
  const setSort = (key: SortKey) => {
    if (sortKey === key) setP({ dir: sortDir === "asc" ? "desc" : "asc" });
    else setP({ sort: key, dir: "desc" });
  };
  const setPSort = (key: typeof pSort) => {
    if (pSort === key) setP({ pDir: pDir === "asc" ? "desc" : "asc" });
    else setP({ pSort: key, pDir: "desc" });
  };

  const listQ = useInvoices(tenantId, { unpaidOnly });
  const paymentsQ = useAllPayments(tab === "payments" ? tenantId : null);
  const settingsQ = useInvoicingSettings(tenantId);
  const issueMut = useIssueInvoice(tenantId ?? "");
  const voidMut = useVoidInvoice(tenantId ?? "");
  const updateMut = useUpdateInvoice(tenantId ?? "");
  const sendMut = useSendInvoiceEmail(tenantId ?? "");

  // Available billing periods derived from data
  const periodOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of listQ.data ?? []) {
      const bp = (r as any).billing_period_start as string | null;
      if (bp) s.add(bp);
    }
    return Array.from(s).sort().reverse().map((iso) => ({
      value: iso,
      label: format(parseISO(iso), "MMM yyyy"),
    }));
  }, [listQ.data]);

  // Filter rows
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (listQ.data ?? []).filter((r) => {
      // status filter
      if (activeStatuses.length && !activeStatuses.includes(r.status)) return false;
      // voided
      if (!includeVoided && r.status === "cancelled") return false;
      // date range
      const df = (r as any)[dateField] as string | null;
      if (from && (!df || df < from)) return false;
      if (to && (!df || df > to)) return false;
      // period
      if (period && (r as any).billing_period_start !== period) return false;
      // search
      if (term) {
        const hay = `${r.invoice_number} ${r.customer?.full_name ?? ""} ${r.customer?.customer_number ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [listQ.data, activeStatuses, includeVoided, from, to, period, q, dateField]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av: any = sortKey === "customer" ? a.customer?.full_name ?? "" : (a as any)[sortKey];
      const bv: any = sortKey === "customer" ? b.customer?.full_name ?? "" : (b as any)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      const an = Number(av), bn = Number(bv);
      if (!Number.isNaN(an) && !Number.isNaN(bn) && typeof av !== "string") return (an - bn) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const grouped = useMemo(() => {
    if (groupBy === "flat") return [{ key: "", label: "", rows: sorted }];
    const map = new Map<string, { key: string; label: string; rows: typeof sorted }>();
    for (const r of sorted) {
      let key = ""; let label = "";
      if (groupBy === "customer") {
        key = r.customer?.id ?? "unknown";
        label = r.customer?.full_name ?? "Unknown customer";
      } else {
        const bp = (r as any).billing_period_start as string | null;
        key = bp ?? "none";
        label = bp ? format(parseISO(bp), "MMMM yyyy") : "No billing period";
      }
      if (!map.has(key)) map.set(key, { key, label, rows: [] as any });
      map.get(key)!.rows.push(r);
    }
    return Array.from(map.values());
  }, [sorted, groupBy]);

  const stats = useMemo(() => {
    const all = sorted;
    const today = new Date().toISOString().slice(0, 10);
    const somIso = startOfThisMonth();
    let outstanding = 0, overdueCount = 0, overdueAmount = 0, paidThisMonth = 0, drafts = 0, draftValue = 0;
    const buckets = { b0: 0, b30: 0, b60: 0, b90: 0, b90p: 0 };
    let dsoSum = 0, dsoN = 0;
    for (const r of all) {
      const bal = Number(r.balance_due ?? 0);
      if (r.status === "draft") { drafts++; draftValue += Number(r.total ?? 0); }
      if (r.status !== "cancelled" && r.status !== "draft" && bal > 0) outstanding += bal;
      if (r.due_date && r.due_date < today && bal > 0 && r.status !== "cancelled" && r.status !== "draft") {
        overdueCount++;
        overdueAmount += bal;
        const age = daysBetween(r.due_date, today);
        if (age <= 30) buckets.b30 += bal;
        else if (age <= 60) buckets.b60 += bal;
        else if (age <= 90) buckets.b90 += bal;
        else buckets.b90p += bal;
      }
      if (bal > 0 && r.due_date && r.due_date >= today) buckets.b0 += bal;
      if (r.status === "paid" && r.issue_date && r.issue_date >= somIso) paidThisMonth += Number(r.total ?? 0);
      if (r.status === "paid" && r.issue_date && (r as any).paid_at) {
        const d = daysBetween(r.issue_date, (r as any).paid_at.slice(0, 10));
        if (d >= 0) { dsoSum += d; dsoN++; }
      }
    }
    const dso = dsoN ? Math.round(dsoSum / dsoN) : null;
    return { outstanding, overdueCount, overdueAmount, paidThisMonth, drafts, draftValue, buckets, dso };
  }, [sorted]);

  const allIds = sorted.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(allIds));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const clearSelection = () => setSelected(new Set());

  const selectedRows = sorted.filter((r) => selected.has(r.id));
  const dueDays = (settingsQ.data as any)?.default_due_days ?? 7;

  async function bulkIssue() {
    const targets = selectedRows.filter((r) => r.status === "draft");
    if (!targets.length) { toast.error("No draft invoices selected"); return; }
    if (!(await confirm({ title: `Issue ${targets.length} invoice(s)?`, description: "They'll be numbered, dated, and moved to Sent.", confirmLabel: "Issue", tone: "primary" }))) return;
    setWorking(true);
    let ok = 0, fail = 0;
    for (const r of targets) {
      try { await issueMut.mutateAsync({ id: r.id, due_days: dueDays }); ok++; } catch { fail++; }
    }
    setWorking(false);
    toast[fail ? "warning" : "success"](`Issued ${ok}${fail ? ` · ${fail} failed` : ""}`);
    clearSelection();
  }
  async function bulkSend() {
    const targets = selectedRows.filter((r) => r.status !== "draft" && r.status !== "cancelled");
    if (!targets.length) { toast.error("Select issued invoices to send"); return; }
    if (!(await confirm({ title: `Email ${targets.length} invoice(s)?`, description: "Sends to each customer's email on file.", confirmLabel: "Send emails", tone: "primary" }))) return;
    setWorking(true);
    let ok = 0, fail = 0;
    for (const r of targets) {
      try { await sendMut.mutateAsync({ invoice_id: r.id, kind: "send" }); ok++; } catch { fail++; }
    }
    setWorking(false);
    toast[fail ? "warning" : "success"](`Sent ${ok}${fail ? ` · ${fail} failed` : ""}`);
    clearSelection();
  }
  async function bulkMarkSent() {
    const targets = selectedRows.filter((r) => r.status === "draft");
    if (!targets.length) { toast.error("No draft invoices selected"); return; }
    if (!(await confirm({ title: `Mark ${targets.length} as sent?`, description: "Skips emailing but updates status.", confirmLabel: "Mark sent", tone: "primary" }))) return;
    setWorking(true);
    let ok = 0, fail = 0;
    for (const r of targets) {
      try {
        await updateMut.mutateAsync({ id: r.id, patch: { status: "sent", issue_date: todayIso(), sent_at: new Date().toISOString() } as any });
        ok++;
      } catch { fail++; }
    }
    setWorking(false);
    toast[fail ? "warning" : "success"](`Marked ${ok}${fail ? ` · ${fail} failed` : ""}`);
    clearSelection();
  }
  async function bulkVoid() {
    const targets = selectedRows.filter((r) => r.status !== "cancelled");
    if (!targets.length) { toast.error("Nothing to void"); return; }
    if (!(await confirm({ title: `Void ${targets.length} invoice(s)?`, description: "This cannot be undone.", confirmLabel: "Void", tone: "destructive" }))) return;
    setWorking(true);
    let ok = 0, fail = 0;
    for (const r of targets) {
      try { await voidMut.mutateAsync(r.id); ok++; } catch { fail++; }
    }
    setWorking(false);
    toast[fail ? "warning" : "success"](`Voided ${ok}${fail ? ` · ${fail} failed` : ""}`);
    clearSelection();
  }
  function exportCsv() {
    const rows: string[][] = [[
      "Invoice", "Customer", "Customer #", "Period", "Issued", "Due", "Total", "Paid", "Balance", "Status",
    ]];
    for (const r of sorted) {
      rows.push([
        r.invoice_number,
        r.customer?.full_name ?? "",
        r.customer?.customer_number ?? "",
        (r as any).billing_period_start ? format(parseISO((r as any).billing_period_start), "MMM yyyy") : "",
        r.issue_date ?? "",
        r.due_date ?? "",
        Number(r.total ?? 0).toFixed(2),
        Number(r.amount_paid ?? 0).toFixed(2),
        Number(r.balance_due ?? 0).toFixed(2),
        r.status,
      ]);
    }
    downloadCsv(`invoices-${todayIso()}.csv`, rows);
  }

  // ------- Payments derived -------
  const paymentsFiltered = useMemo(() => {
    const term = pQ.trim().toLowerCase();
    const arr = (paymentsQ.data ?? []).filter((p: any) => {
      if (pMethod && p.payment_method !== pMethod) return false;
      const day = p.paid_at ? p.paid_at.slice(0, 10) : "";
      if (pFrom && (!day || day < pFrom)) return false;
      if (pTo && (!day || day > pTo)) return false;
      if (term) {
        const hay = `${p.customer?.full_name ?? ""} ${p.invoice?.invoice_number ?? ""} ${p.payment_reference ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    arr.sort((a: any, b: any) => {
      const dir = pDir === "asc" ? 1 : -1;
      if (pSort === "amount") return (Number(a.amount) - Number(b.amount)) * dir;
      if (pSort === "payment_method") return String(a.payment_method).localeCompare(String(b.payment_method)) * dir;
      return String(a.paid_at ?? "").localeCompare(String(b.paid_at ?? "")) * dir;
    });
    return arr;
  }, [paymentsQ.data, pMethod, pFrom, pTo, pQ, pSort, pDir]);

  const paymentsTotal = paymentsFiltered.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);

  function exportPaymentsCsv() {
    const rows: string[][] = [["Date", "Invoice", "Customer", "Method", "Reference", "Amount"]];
    for (const p of paymentsFiltered) {
      rows.push([
        p.paid_at ? format(new Date(p.paid_at), "yyyy-MM-dd") : "",
        p.invoice?.invoice_number ?? "",
        p.customer?.full_name ?? "",
        p.payment_method,
        p.payment_reference ?? "",
        Number(p.amount ?? 0).toFixed(2),
      ]);
    }
    downloadCsv(`payments-${todayIso()}.csv`, rows);
  }

  return (
    <>
      <AppHeader
        title="Invoices & Payments"
        subtitle="Bill customers, capture payments, chase overdue balances."
        tabs={[
          { label: "Invoices", active: tab === "invoices", onClick: () => setParams({}) },
          { label: "Payments", active: tab === "payments", onClick: () => setParams({ tab: "payments" }) },
          { label: "Settings", onClick: () => navigate("/admin/settings/invoicing") },
        ]}
        actions={
          tab === "invoices" && (
            <Can code="invoices.create">
              <button
                onClick={() => setNewOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark"
              >
                <Plus className="h-4 w-4" /> New invoice
              </button>
            </Can>
          )
        }
      />
      <div className="flex-1 space-y-6 p-6">
        {tab === "invoices" ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <Stat label="Outstanding" value={fmtZar(stats.outstanding)} tone="text-sk-coral-dark" />
              <div className="sk-card p-5">
                <div className="text-2xl font-semibold text-sk-orange">{fmtZar(stats.overdueAmount)}</div>
                <div className="mt-1 sk-stat-label">Overdue · {stats.overdueCount}</div>
                <AgingBar buckets={stats.buckets} />
              </div>
              <Stat label="Paid this month" value={fmtZar(stats.paidThisMonth)} tone="text-sk-green" />
              <Stat label={`Drafts · ${stats.drafts}`} value={fmtZar(stats.draftValue)} tone="text-foreground" />
              <Stat label="Avg days to pay" value={stats.dso == null ? "—" : `${stats.dso} d`} tone="text-sk-turquoise-dark" />
            </div>

            <div className="sk-card space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={(e) => setP({ q: e.target.value || null })}
                    placeholder="Search invoice #, customer, SK number…"
                    className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm"
                  />
                </div>
                <select value={period} onChange={(e) => setP({ period: e.target.value || null })}
                  className="h-9 rounded-lg border border-border bg-white px-2 text-sm">
                  <option value="">All periods</option>
                  {periodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <div className="flex items-center gap-1 rounded-lg border border-border bg-white px-1 text-xs">
                  <span className="pl-2 pr-1 text-muted-foreground">By</span>
                  <select value={dateField} onChange={(e) => setP({ dateField: e.target.value as any })}
                    className="h-8 rounded-md bg-transparent px-1 text-xs">
                    <option value="issue_date">Issue date</option>
                    <option value="due_date">Due date</option>
                  </select>
                  <input type="date" value={from} onChange={(e) => setP({ from: e.target.value || null })}
                    className="h-8 rounded-md border-none bg-transparent text-xs" />
                  <span className="text-muted-foreground">→</span>
                  <input type="date" value={to} onChange={(e) => setP({ to: e.target.value || null })}
                    className="h-8 rounded-md border-none bg-transparent text-xs" />
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-border bg-white px-1 text-xs">
                  <span className="pl-2 pr-1 text-muted-foreground">Group</span>
                  <select value={groupBy} onChange={(e) => setP({ group: e.target.value === "flat" ? null : e.target.value })}
                    className="h-8 rounded-md bg-transparent px-1 text-xs">
                    <option value="flat">Flat</option>
                    <option value="customer">By customer</option>
                    <option value="month">By month</option>
                  </select>
                </div>
                <button onClick={exportCsv}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm hover:bg-sk-surface-muted">
                  <Download className="h-4 w-4" /> Export CSV
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Status</span>
                {STATUS_OPTIONS.map((s) => {
                  const on = activeStatuses.includes(s.code);
                  return (
                    <button key={s.code} onClick={() => toggleStatus(s.code)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white text-muted-foreground hover:bg-sk-surface-muted"}`}>
                      {s.label}
                    </button>
                  );
                })}
                <label className="ml-2 flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={unpaidOnly} onChange={(e) => setP({ unpaid: e.target.checked ? "1" : null })} />
                  Unpaid only
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={includeVoided} onChange={(e) => setP({ voided: e.target.checked ? "1" : null })} />
                  Include voided
                </label>
                {(activeStatuses.length || unpaidOnly || includeVoided || from || to || period || q) ? (
                  <button onClick={() => setParams({})} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                    Clear filters
                  </button>
                ) : null}
              </div>
            </div>

            {selected.size > 0 && (
              <div className="sk-card flex flex-wrap items-center gap-2 border-sk-coral/40 bg-sk-coral-soft/40 p-3 text-sm">
                <span className="font-medium">{selected.size} selected</span>
                <button disabled={working} onClick={bulkIssue}
                  className="ml-2 inline-flex items-center gap-1.5 rounded-md bg-sk-coral px-2.5 py-1 text-xs font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Issue
                </button>
                <button disabled={working} onClick={bulkSend}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold hover:bg-sk-surface-muted disabled:opacity-50">
                  <Send className="h-3.5 w-3.5" /> Send email
                </button>
                <button disabled={working} onClick={bulkMarkSent}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold hover:bg-sk-surface-muted disabled:opacity-50">
                  Mark as sent
                </button>
                <button disabled={working} onClick={bulkVoid}
                  className="inline-flex items-center gap-1.5 rounded-md border border-sk-coral-dark/30 bg-white px-2.5 py-1 text-xs font-semibold text-sk-coral-dark hover:bg-sk-coral-soft disabled:opacity-50">
                  <Ban className="h-3.5 w-3.5" /> Void
                </button>
                <button onClick={clearSelection}
                  className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" /> Clear
                </button>
              </div>
            )}

            <div className="sk-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 w-8">
                        <input type="checkbox"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected; }}
                          onChange={toggleSelectAll} />
                      </th>
                      <Th onClick={() => setSort("invoice_number")} active={sortKey === "invoice_number"} dir={sortDir}>Number</Th>
                      <Th onClick={() => setSort("customer")} active={sortKey === "customer"} dir={sortDir}>Customer</Th>
                      <Th onClick={() => setSort("issue_date")} active={sortKey === "issue_date"} dir={sortDir}>Issued</Th>
                      <Th onClick={() => setSort("due_date")} active={sortKey === "due_date"} dir={sortDir}>Due</Th>
                      <Th onClick={() => setSort("total")} active={sortKey === "total"} dir={sortDir} align="right">Total</Th>
                      <Th onClick={() => setSort("amount_paid")} active={sortKey === "amount_paid"} dir={sortDir} align="right">Paid</Th>
                      <Th onClick={() => setSort("balance_due")} active={sortKey === "balance_due"} dir={sortDir} align="right">Balance</Th>
                      <Th onClick={() => setSort("status")} active={sortKey === "status"} dir={sortDir}>Status</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {listQ.isLoading && (
                      <tr><td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">Loading…</td></tr>
                    )}
                    {!listQ.isLoading && sorted.length === 0 && (
                      <tr><td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">
                        <FileText className="mx-auto mb-2 h-6 w-6 opacity-50" />
                        No invoices match these filters.
                      </td></tr>
                    )}
                    {grouped.map((g) => (
                      <Fragment key={"g-" + g.key}>
                        {groupBy !== "flat" && g.rows.length > 0 && (
                          <tr key={"h-" + g.key} className="bg-sk-surface-muted/60">
                            <td colSpan={9} className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {g.label} · {g.rows.length} · Balance {fmtZar(g.rows.reduce((s, r) => s + Number(r.balance_due ?? 0), 0))}
                            </td>
                          </tr>
                        )}
                        {g.rows.map((r) => (
                          <tr key={r.id}
                            className="cursor-pointer hover:bg-sk-surface-muted/40"
                            onClick={() => navigate(`/admin/invoices/${r.id}`)}>
                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} />
                            </td>
                            <td className="px-5 py-3 font-mono text-xs">
                              <div>{r.invoice_number}</div>
                              {(r as any).billing_period_start && (
                                <div className="mt-0.5 inline-flex rounded-full bg-sk-teal/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sk-teal">
                                  {format(new Date((r as any).billing_period_start), "MMM yyyy")}
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              <div className="font-medium">{r.customer?.full_name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground">{r.customer?.customer_number}</div>
                            </td>
                            <td className="px-5 py-3">{r.issue_date ? format(new Date(r.issue_date), "dd MMM yyyy") : "—"}</td>
                            <td className="px-5 py-3">{r.due_date ? format(new Date(r.due_date), "dd MMM yyyy") : "—"}</td>
                            <td className="px-5 py-3 text-right tabular-nums">{fmtZar(r.total)}</td>
                            <td className="px-5 py-3 text-right tabular-nums">{fmtZar(r.amount_paid)}</td>
                            <td className="px-5 py-3 text-right tabular-nums font-semibold">{fmtZar(r.balance_due)}</td>
                            <td className="px-5 py-3"><InvoiceStatusChip status={r.status} /></td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label="Payments (filtered)" value={String(paymentsFiltered.length)} tone="text-foreground" />
              <Stat label="Total collected" value={fmtZar(paymentsTotal)} tone="text-sk-green" />
              <Stat label="Average payment" value={fmtZar(paymentsFiltered.length ? paymentsTotal / paymentsFiltered.length : 0)} tone="text-sk-turquoise-dark" />
            </div>
            <div className="sk-card flex flex-wrap items-center gap-3 p-4">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={pQ}
                  onChange={(e) => setP({ pQ: e.target.value || null })}
                  placeholder="Search customer, invoice, reference…"
                  className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm"
                />
              </div>
              <select value={pMethod} onChange={(e) => setP({ pMethod: e.target.value || null })}
                className="h-9 rounded-lg border border-border bg-white px-2 text-sm capitalize">
                <option value="">All methods</option>
                {Array.from(new Set((paymentsQ.data ?? []).map((p: any) => p.payment_method))).map((m: any) =>
                  <option key={m} value={m} className="capitalize">{m}</option>
                )}
              </select>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-white px-1 text-xs">
                <span className="pl-2 pr-1 text-muted-foreground">From</span>
                <input type="date" value={pFrom} onChange={(e) => setP({ pFrom: e.target.value || null })}
                  className="h-8 rounded-md border-none bg-transparent text-xs" />
                <span className="text-muted-foreground">→</span>
                <input type="date" value={pTo} onChange={(e) => setP({ pTo: e.target.value || null })}
                  className="h-8 rounded-md border-none bg-transparent text-xs" />
              </div>
              <button onClick={exportPaymentsCsv}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm hover:bg-sk-surface-muted">
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
            <div className="sk-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <Th onClick={() => setPSort("paid_at")} active={pSort === "paid_at"} dir={pDir}>Date</Th>
                      <th className="px-5 py-3">Invoice</th>
                      <th className="px-5 py-3">Customer</th>
                      <Th onClick={() => setPSort("payment_method")} active={pSort === "payment_method"} dir={pDir}>Method</Th>
                      <th className="px-5 py-3">Reference</th>
                      <Th onClick={() => setPSort("amount")} active={pSort === "amount"} dir={pDir} align="right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paymentsQ.isLoading && (
                      <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">Loading…</td></tr>
                    )}
                    {!paymentsQ.isLoading && paymentsFiltered.length === 0 && (
                      <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No payments match these filters.</td></tr>
                    )}
                    {paymentsFiltered.map((p: any) => (
                      <tr key={p.id} className="hover:bg-sk-surface-muted/40">
                        <td className="px-5 py-3">{p.paid_at ? format(new Date(p.paid_at), "dd MMM yyyy") : "—"}</td>
                        <td className="px-5 py-3 font-mono text-xs">
                          {p.invoice ? (
                            <Link to={`/admin/invoices/${p.invoice.id}`} className="hover:text-sk-coral-dark">
                              {p.invoice.invoice_number}
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-3">{p.customer?.full_name ?? "—"}</td>
                        <td className="px-5 py-3 capitalize">{p.payment_method}</td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">{p.payment_reference ?? "—"}</td>
                        <td className="px-5 py-3 text-right tabular-nums font-semibold">{fmtZar(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {newOpen && tenantId && (
        <NewInvoiceDrawer tenantId={tenantId} onClose={() => setNewOpen(false)}
          onCreated={(id) => { setNewOpen(false); navigate(`/admin/invoices/${id}`); }} />
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="sk-card p-5">
      <div className={"text-2xl font-semibold " + tone}>{value}</div>
      <div className="mt-1 sk-stat-label">{label}</div>
    </div>
  );
}

function Th({ children, onClick, active, dir, align }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: SortDir; align?: "right" }) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`px-5 py-3 ${align === "right" ? "text-right" : ""}`}>
      <button onClick={onClick}
        className={`inline-flex items-center gap-1 uppercase tracking-wide ${active ? "text-foreground" : ""} ${align === "right" ? "ml-auto" : ""}`}>
        {children}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

function AgingBar({ buckets }: { buckets: { b0: number; b30: number; b60: number; b90: number; b90p: number } }) {
  const total = buckets.b0 + buckets.b30 + buckets.b60 + buckets.b90 + buckets.b90p;
  if (total <= 0) return <div className="mt-3 text-[10px] text-muted-foreground">No outstanding balance.</div>;
  const seg = (v: number, cls: string, label: string) => {
    const pct = (v / total) * 100;
    if (pct <= 0) return null;
    return <div className={cls} style={{ width: `${pct}%` }} title={`${label}: ${fmtZar(v)}`} />;
  };
  return (
    <div className="mt-3">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-sk-surface-muted">
        {seg(buckets.b0, "bg-sk-green", "Current")}
        {seg(buckets.b30, "bg-sk-orange-soft", "1–30")}
        {seg(buckets.b60, "bg-sk-orange", "31–60")}
        {seg(buckets.b90, "bg-sk-coral", "61–90")}
        {seg(buckets.b90p, "bg-sk-coral-dark", "90+")}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>Now</span><span>30</span><span>60</span><span>90</span><span>90+</span>
      </div>
    </div>
  );
}