import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, FileText, Search } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useInvoices, useAllPayments } from "./queries";
import { InvoiceStatusChip, fmtZar } from "./status";
import { NewInvoiceDrawer } from "./NewInvoiceDrawer";
import { format } from "date-fns";
import { Can } from "@/components/auth/Can";

export default function InvoicesListPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "invoices";

  const [status, setStatus] = useState<string>("");
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const listQ = useInvoices(tenantId, { status: status || undefined, unpaidOnly });
  const paymentsQ = useAllPayments(tab === "payments" ? tenantId : null);

  const rows = useMemo(() => {
    const all = listQ.data ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter((r) =>
      r.invoice_number.toLowerCase().includes(term) ||
      (r.customer?.full_name ?? "").toLowerCase().includes(term) ||
      (r.customer?.customer_number ?? "").toLowerCase().includes(term),
    );
  }, [listQ.data, q]);

  const stats = useMemo(() => {
    const all = listQ.data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const startOfMonth = new Date(); startOfMonth.setDate(1);
    const somIso = startOfMonth.toISOString().slice(0, 10);
    let outstanding = 0, overdue = 0, paidThisMonth = 0, drafts = 0;
    for (const r of all) {
      const bal = Number(r.balance_due ?? 0);
      if (r.status === "draft") drafts++;
      if (r.status !== "cancelled" && r.status !== "draft" && bal > 0) outstanding += bal;
      if (r.due_date && r.due_date < today && bal > 0 && r.status !== "cancelled" && r.status !== "draft") overdue++;
      if (r.status === "paid" && r.issue_date && r.issue_date >= somIso) paidThisMonth += Number(r.total ?? 0);
    }
    return { outstanding, overdue, paidThisMonth, drafts };
  }, [listQ.data]);

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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Outstanding" value={fmtZar(stats.outstanding)} tone="text-sk-coral-dark" />
              <Stat label="Overdue" value={String(stats.overdue)} tone="text-sk-orange" />
              <Stat label="Paid this month" value={fmtZar(stats.paidThisMonth)} tone="text-sk-green" />
              <Stat label="Drafts" value={String(stats.drafts)} tone="text-foreground" />
            </div>

            <div className="sk-card p-4 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by number or customer…"
                  className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm"
                />
              </div>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="h-9 rounded-lg border border-border bg-white px-2 text-sm">
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="part_paid">Part paid</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Void</option>
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />
                Unpaid only
              </label>
            </div>

            <div className="sk-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3">Number</th>
                      <th className="px-5 py-3">Customer</th>
                      <th className="px-5 py-3">Issued</th>
                      <th className="px-5 py-3">Due</th>
                      <th className="px-5 py-3 text-right">Total</th>
                      <th className="px-5 py-3 text-right">Paid</th>
                      <th className="px-5 py-3 text-right">Balance</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {listQ.isLoading && (
                      <tr><td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">Loading…</td></tr>
                    )}
                    {!listQ.isLoading && rows.length === 0 && (
                      <tr><td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                        <FileText className="mx-auto mb-2 h-6 w-6 opacity-50" />
                        No invoices yet.
                      </td></tr>
                    )}
                    {rows.map((r) => (
                      <tr key={r.id}
                        className="cursor-pointer hover:bg-sk-surface-muted/40"
                        onClick={() => navigate(`/admin/invoices/${r.id}`)}>
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
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="sk-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Invoice</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Method</th>
                    <th className="px-5 py-3">Reference</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paymentsQ.isLoading && (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">Loading…</td></tr>
                  )}
                  {!paymentsQ.isLoading && (paymentsQ.data ?? []).length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No payments recorded yet.</td></tr>
                  )}
                  {(paymentsQ.data ?? []).map((p: any) => (
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