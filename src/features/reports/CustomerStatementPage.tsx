import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { Printer, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useCustomer } from "@/features/customers/queries";
import { useCustomerCreditBalance, useCustomerCreditLedger } from "@/features/customerCredit/queries";
import { fmtZar } from "@/features/invoices/status";

interface Row { date: string; kind: string; ref: string; debit: number; credit: number; }

function useStatementData(tenantId: string | null, customerId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["statement", tenantId, customerId, from, to],
    enabled: Boolean(tenantId && customerId),
    queryFn: async () => {
      const [inv, pays, cns] = await Promise.all([
        (supabase as any).from("invoices").select("id, invoice_number, issue_date, due_date, total, amount_paid, balance_due, status")
          .eq("tenant_id", tenantId).eq("customer_id", customerId)
          .gte("issue_date", from).lte("issue_date", to)
          .in("status", ["sent","part_paid","paid","overdue","cancelled"])
          .order("issue_date"),
        (supabase as any).from("payments").select("id, invoice_id, amount, paid_at, payment_method, payment_reference")
          .eq("tenant_id", tenantId).eq("customer_id", customerId)
          .gte("paid_at", from).lte("paid_at", to + "T23:59:59")
          .order("paid_at"),
        (supabase as any).from("credit_notes").select("id, credit_note_number, issue_date, total, invoice_id, status")
          .eq("tenant_id", tenantId).eq("customer_id", customerId)
          .in("status", ["issued","applied"])
          .gte("issue_date", from).lte("issue_date", to)
          .order("issue_date"),
      ]);
      if (inv.error) throw inv.error;
      if (pays.error) throw pays.error;
      if (cns.error) throw cns.error;
      return {
        invoices: (inv.data ?? []) as any[],
        payments: (pays.data ?? []) as any[],
        creditNotes: (cns.data ?? []) as any[],
      };
    },
  });
}

export default function CustomerStatementPage() {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useCurrentTenant();
  const [sp] = useSearchParams();
  const to = sp.get("to") ?? format(new Date(), "yyyy-MM-dd");
  const from = sp.get("from") ?? format(subDays(new Date(), 90), "yyyy-MM-dd");
  const custQ = useCustomer(id, tenant?.id);
  const dataQ = useStatementData(tenant?.id ?? null, id ?? null, from, to);
  const balQ = useCustomerCreditBalance(tenant?.id ?? null, id ?? null);
  const ledQ = useCustomerCreditLedger(tenant?.id ?? null, id ?? null);

  const rows: Row[] = useMemo(() => {
    if (!dataQ.data) return [];
    const list: Row[] = [];
    for (const i of dataQ.data.invoices) {
      if (i.status === "cancelled") continue;
      list.push({ date: i.issue_date, kind: "Invoice", ref: i.invoice_number, debit: Number(i.total), credit: 0 });
    }
    for (const p of dataQ.data.payments) {
      list.push({ date: (p.paid_at ?? "").slice(0,10), kind: "Payment", ref: p.payment_reference ?? p.payment_method ?? "Payment", debit: 0, credit: Number(p.amount) });
    }
    for (const c of dataQ.data.creditNotes) {
      list.push({ date: c.issue_date, kind: "Credit note", ref: c.credit_note_number, debit: 0, credit: Number(c.total) });
    }
    // Include credit ledger allocations in period (customer paid via credit)
    for (const l of ledQ.data ?? []) {
      if (l.entry_type === "allocation" && l.entry_date >= from && l.entry_date <= to) {
        list.push({ date: l.entry_date, kind: "Credit applied", ref: "Customer credit", debit: 0, credit: Math.abs(Number(l.amount)) });
      }
    }
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [dataQ.data, ledQ.data, from, to]);

  const totals = rows.reduce((a, r) => ({ debit: a.debit + r.debit, credit: a.credit + r.credit }), { debit: 0, credit: 0 });
  const netMovement = totals.debit - totals.credit;
  const outstanding = (dataQ.data?.invoices ?? []).reduce((s, i) => s + Number(i.balance_due ?? 0), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Link to={`/admin/customers/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to customer
        </Link>
        <button onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-white p-8 print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold">{tenant?.name ?? ""}</div>
            <div className="text-xs text-muted-foreground">Statement of account</div>
          </div>
          <div className="text-right text-xs">
            <div>Period: {format(new Date(from), "dd MMM yyyy")} – {format(new Date(to), "dd MMM yyyy")}</div>
            <div className="text-muted-foreground">Generated: {format(new Date(), "dd MMM yyyy")}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-2 rounded-xl bg-sk-surface-muted p-4 text-sm">
          <div className="font-semibold">{custQ.data?.full_name ?? "—"}</div>
          {custQ.data?.customer_number && <div className="text-xs text-muted-foreground">#{custQ.data.customer_number}</div>}
          {custQ.data?.email && <div className="text-xs">{custQ.data.email}</div>}
          {custQ.data?.mobile && <div className="text-xs">{custQ.data.mobile}</div>}
        </div>

        <table className="mt-6 w-full text-sm">
          <thead className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="border-b border-border py-2">Date</th>
              <th className="border-b border-border py-2">Type</th>
              <th className="border-b border-border py-2">Reference</th>
              <th className="border-b border-border py-2 text-right">Charges</th>
              <th className="border-b border-border py-2 text-right">Payments / Credits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dataQ.isLoading && <tr><td colSpan={5} className="py-8 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>}
            {!dataQ.isLoading && rows.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">No activity in this period.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-2">{r.date ? format(new Date(r.date), "dd MMM yyyy") : "—"}</td>
                <td className="py-2">{r.kind}</td>
                <td className="py-2 text-xs">{r.ref}</td>
                <td className="py-2 text-right tabular-nums">{r.debit > 0 ? fmtZar(r.debit) : ""}</td>
                <td className="py-2 text-right tabular-nums">{r.credit > 0 ? fmtZar(r.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-sm font-semibold">
            <tr>
              <td colSpan={3} className="border-t-2 border-border pt-2">Totals</td>
              <td className="border-t-2 border-border pt-2 text-right tabular-nums">{fmtZar(totals.debit)}</td>
              <td className="border-t-2 border-border pt-2 text-right tabular-nums">{fmtZar(totals.credit)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-6 grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Net movement</div>
            <div className="text-lg font-semibold tabular-nums">{fmtZar(netMovement)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Currently outstanding</div>
            <div className="text-lg font-semibold tabular-nums">{fmtZar(outstanding)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Credit on account</div>
            <div className="text-lg font-semibold tabular-nums text-sk-green">{fmtZar(balQ.data ?? 0)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}