import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { FileMinus, Search } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useCreditNotes } from "./queries";
import { CreditNoteStatusChip, fmtZar } from "./status";

export default function CreditNotesListPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState("");

  const listQ = useCreditNotes(tenantId, { status: (status || undefined) as any });
  const rows = useMemo(() => {
    const all = listQ.data ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter((r) =>
      r.credit_note_number.toLowerCase().includes(term) ||
      (r.customer?.full_name ?? "").toLowerCase().includes(term) ||
      (r.invoice?.invoice_number ?? "").toLowerCase().includes(term),
    );
  }, [listQ.data, q]);

  return (
    <>
      <AppHeader
        title="Credit notes"
        subtitle="Reverse issued invoices, apply credit against customer balances."
      />
      <div className="flex-1 space-y-6 p-6">
        <div className="sk-card p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search by number, customer, invoice…"
              className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-lg border border-border bg-white px-2 text-sm">
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="applied">Applied</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="sk-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Number</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-5 py-3">Issued</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-right">Applied</th>
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
                    <FileMinus className="mx-auto mb-2 h-6 w-6 opacity-50" />
                    No credit notes yet. Issue one from an invoice's detail page.
                  </td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-sk-surface-muted/40"
                    onClick={() => navigate(`/admin/credit-notes/${r.id}`)}>
                    <td className="px-5 py-3 font-mono text-xs">{r.credit_note_number}</td>
                    <td className="px-5 py-3">
                      <div className="font-medium">{r.customer?.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.customer?.customer_number}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{r.invoice?.invoice_number ?? "—"}</td>
                    <td className="px-5 py-3">{r.issue_date ? format(new Date(r.issue_date), "dd MMM yyyy") : "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtZar(r.total)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtZar(r.amount_applied)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">{fmtZar(r.balance)}</td>
                    <td className="px-5 py-3"><CreditNoteStatusChip status={r.status} /></td>
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