import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { useCurrentCustomer } from "../hooks";
import { fmtZar } from "@/features/invoices/status";
import { fmtDate } from "../portalCommon";

export default function MyPaymentsPage() {
  const cust = useCurrentCustomer();
  const q = useQuery({
    queryKey: ["portal_payments", cust.data?.id],
    enabled: !!cust.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, payment_method, payment_reference, paid_at, status, invoice:invoices(id, invoice_number)")
        .eq("customer_id", cust.data!.id)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <AppHeader title="Payments" subtitle="Your payment history" />
      <div className="flex-1 p-6">
        {q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {q.data && q.data.length === 0 && <div className="sk-card p-10 text-center text-sm text-muted-foreground">No payments yet.</div>}
        {q.data && q.data.length > 0 && (
          <div className="sk-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="text-left"><th className="px-4 py-3">Date</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3 text-right">Amount</th></tr>
              </thead>
              <tbody>
                {q.data.map((p: any) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-3">{fmtDate(p.paid_at)}</td>
                    <td className="px-4 py-3">{p.invoice ? <Link to={`/customer/invoices/${p.invoice.id}`} className="hover:underline">{p.invoice.invoice_number}</Link> : "—"}</td>
                    <td className="px-4 py-3">{p.payment_method ?? "—"}</td>
                    <td className="px-4 py-3">{p.payment_reference ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmtZar(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}