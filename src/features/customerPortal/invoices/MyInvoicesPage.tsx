import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CalendarPlus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { useCurrentCustomer } from "../hooks";
import { InvoiceStatusChip, effectiveInvoiceStatus, fmtZar } from "@/features/invoices/status";
import { fmtDate } from "../portalCommon";

export default function MyInvoicesPage() {
  const cust = useCurrentCustomer();
  const [tab, setTab] = useState<"invoices" | "credits">("invoices");
  const q = useQuery({
    queryKey: ["portal_invoices", cust.data?.id],
    enabled: !!cust.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, issue_date, due_date, total, amount_paid, balance_due")
        .eq("customer_id", cust.data!.id)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const credits = useQuery({
    queryKey: ["portal_credit_notes", cust.data?.id],
    enabled: !!cust.data?.id && tab === "credits",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_notes")
        .select("id, credit_note_number, status, issue_date, total, invoice:invoices(id, invoice_number)")
        .eq("customer_id", cust.data!.id)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <AppHeader
        title="Invoices"
        subtitle="Your invoices, credits and outstanding balances"
        tabs={[
          { label: "Invoices",     active: tab === "invoices", onClick: () => setTab("invoices") },
          { label: "Credit notes", active: tab === "credits",  onClick: () => setTab("credits") },
        ]}
      />
      <div className="flex-1 p-6">
        {tab === "invoices" && (<>
        {q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {q.data && q.data.length === 0 && (
          <div className="sk-card grid place-items-center gap-3 p-10 text-center">
            <div className="text-sm text-muted-foreground">No invoices yet.</div>
            <Link to="/customer/bookings/new" className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark">
              <CalendarPlus className="h-4 w-4" /> Book a service
            </Link>
          </div>
        )}
        {q.data && q.data.length > 0 && (
          <div className="sk-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Issued</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((i: any) => (
                  <tr key={i.id} className="border-t border-border hover:bg-sk-surface-muted">
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/customer/invoices/${i.id}`} className="hover:underline">{i.invoice_number}</Link>
                    </td>
                    <td className="px-4 py-3">{fmtDate(i.issue_date)}</td>
                    <td className="px-4 py-3">{fmtDate(i.due_date)}</td>
                    <td className="px-4 py-3">{fmtZar(i.total)}</td>
                    <td className="px-4 py-3 font-semibold text-sk-coral-dark">{fmtZar(i.balance_due)}</td>
                    <td className="px-4 py-3"><InvoiceStatusChip status={effectiveInvoiceStatus(i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>)}
        {tab === "credits" && (<>
          {credits.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
          {credits.data && credits.data.length === 0 && <div className="sk-card p-10 text-center text-sm text-muted-foreground">No credit notes.</div>}
          {credits.data && credits.data.length > 0 && (
            <div className="sk-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3">Credit note</th>
                    <th className="px-4 py-3">Issued</th>
                    <th className="px-4 py-3">Applied to</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.data.map((c: any) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{c.credit_note_number}</td>
                      <td className="px-4 py-3">{fmtDate(c.issue_date)}</td>
                      <td className="px-4 py-3">{c.invoice ? <Link to={`/customer/invoices/${c.invoice.id}`} className="hover:underline">{c.invoice.invoice_number}</Link> : "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold">{fmtZar(c.total)}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground uppercase">{c.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>)}
      </div>
    </>
  );
}