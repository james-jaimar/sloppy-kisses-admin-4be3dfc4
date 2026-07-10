import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, CreditCard, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { InvoiceStatusChip, effectiveInvoiceStatus, fmtZar } from "@/features/invoices/status";
import { fmtDate } from "../portalCommon";

export default function MyInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [payOpen, setPayOpen] = useState(false);

  const q = useQuery({
    queryKey: ["portal_invoice", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, tenant_id, invoice_number, status, issue_date, due_date, subtotal, total, amount_paid, balance_due, notes, invoice_items(id, description, quantity, unit_price, line_total, sort_order)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const methods = useQuery({
    queryKey: ["portal_payment_methods", q.data?.tenant_id],
    enabled: !!q.data?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("id, label")
        .eq("tenant_id", (q.data as any).tenant_id)
        .eq("is_active", true)
        .order("sort_order");
      if (error) return [];
      return data ?? [];
    },
  });

  if (q.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!q.data) return <div className="p-6 text-sm text-muted-foreground">Invoice not found.</div>;

  const inv: any = q.data;
  const items = [...(inv.invoice_items ?? [])].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const balance = Number(inv.balance_due ?? 0);

  return (
    <>
      <AppHeader
        title={`Invoice ${inv.invoice_number}`}
        subtitle={`Issued ${fmtDate(inv.issue_date)}`}
        actions={
          <button onClick={async () => {
            try {
              const { downloadInvoicePdf } = await import("@/features/invoices/pdf");
              await downloadInvoicePdf(inv.id, `${inv.invoice_number}.pdf`);
            } catch (e: any) { toast.error(e?.message ?? "PDF failed"); }
          }}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
            Download PDF
          </button>
        }
      />
      <div className="flex-1 space-y-6 p-6">
        <Link to="/customer/invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to invoices
        </Link>

        <div className="sk-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <InvoiceStatusChip status={effectiveInvoiceStatus(inv)} />
            {balance > 0 && (
              <button onClick={() => setPayOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark">
                <CreditCard className="h-4 w-4" /> Pay {fmtZar(balance)}
              </button>
            )}
          </div>

          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="text-left"><th className="px-2 py-1">Description</th><th className="px-2 py-1 text-right">Qty</th><th className="px-2 py-1 text-right">Unit</th><th className="px-2 py-1 text-right">Total</th></tr>
            </thead>
            <tbody>
              {items.map((it: any) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="px-2 py-2">{it.description}</td>
                  <td className="px-2 py-2 text-right">{it.quantity}</td>
                  <td className="px-2 py-2 text-right">{fmtZar(it.unit_price)}</td>
                  <td className="px-2 py-2 text-right font-medium">{fmtZar(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ml-auto max-w-xs space-y-1 pt-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmtZar(inv.subtotal)}</span></div>
            <div className="flex justify-between font-semibold"><span>Total</span><span>{fmtZar(inv.total)}</span></div>
            <div className="flex justify-between text-sk-green"><span>Paid</span><span>{fmtZar(inv.amount_paid)}</span></div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold text-sk-coral-dark"><span>Balance</span><span>{fmtZar(balance)}</span></div>
          </div>
          {inv.notes && <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{inv.notes}</div>}
        </div>
      </div>

      {payOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setPayOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Pay invoice</h3>
              <button onClick={() => setPayOpen(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground">Online payment is coming soon. In the meantime, please use one of the following methods and the team will mark your invoice as paid:</p>
            <ul className="mt-3 space-y-2">
              {(methods.data ?? []).map((m: any) => (
                <li key={m.id} className="rounded-lg border border-border px-3 py-2 text-sm font-medium">{m.label}</li>
              ))}
              {(methods.data ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">Contact Sloppy Kisses for payment instructions.</li>
              )}
            </ul>
            <button onClick={() => { toast.success("We'll be in touch shortly"); setPayOpen(false); }} className="mt-4 w-full rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark">Notify us I'll pay</button>
          </div>
        </div>
      )}
    </>
  );
}