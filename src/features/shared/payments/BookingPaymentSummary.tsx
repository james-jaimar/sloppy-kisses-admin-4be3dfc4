import { useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useDeskBookingInvoices } from "./deskInvoiceQueries";
import { invoiceState } from "./invoiceSummary";
import { RecordPaymentDialog } from "@/features/invoices/RecordPaymentDialog";
import { TakePaymentDialog } from "@/features/invoices/TakePaymentDialog";
import { fmtZar } from "@/features/invoices/status";
import type { DeskInvoice } from "./invoiceSummary";

export function BookingPaymentSummary({ tenantId, bookingId, customerId }: { tenantId: string; bookingId: string; customerId: string }) {
  const { hasPermission, profile } = useCurrentUser();
  const can = (code: string) => profile?.user_type === "platform" || hasPermission(code);
  const q = useDeskBookingInvoices(tenantId, [bookingId]);
  const [selected, setSelected] = useState<DeskInvoice | null>(null);
  const [account, setAccount] = useState(false);
  if (!can("invoices.view")) return null;
  const invoices = q.data?.[bookingId] ?? [];
  return <section className="space-y-3 border-y border-border py-4">
    <h3 className="text-sm font-semibold">This visit · invoices</h3>
    {q.isLoading ? <p className="text-sm text-muted-foreground">Loading invoices…</p> : q.isError ? <div className="flex items-center gap-2 text-destructive"><span>Invoice information unavailable</span><Button variant="ghost" size="icon" aria-label="Retry invoices" onClick={() => q.refetch()}><RotateCw /></Button></div> : invoices.length === 0 ? <p className="text-sm text-muted-foreground">No invoice linked</p> : invoices.map(inv => {
      const state = invoiceState(inv);
      return <div key={inv.id} className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><Link className="text-sm font-semibold text-primary underline" to={`/admin/invoices/${inv.id}`}>{inv.invoice_number}</Link><span className={"text-base font-bold " + (state === "outstanding" ? "text-sk-orange" : state === "paid" ? "text-sk-green" : "text-muted-foreground")}>{state === "outstanding" ? `Outstanding ${fmtZar(inv.balance_due)}` : state === "draft" ? "Not yet issued" : state === "paid" ? "Paid" : state === "cancelled" ? "Cancelled" : "Balance needs review"}</span></div>
        {inv.shared && <p className="text-xs text-muted-foreground">Shared invoice · balance covers several visits</p>}
        {state === "outstanding" && can("payments.create") && inv.customer_id === customerId && <Button className="w-full" onClick={() => setSelected(inv)}><CreditCard />Take payment</Button>}
      </div>;
    })}
    {can("payments.create") && <Button variant="link" className="h-auto px-0 whitespace-normal text-left" onClick={() => setAccount(true)}>Other customer invoices</Button>}
    {selected && <RecordPaymentDialog tenantId={tenantId} invoiceId={selected.id} customerId={customerId} suggested={selected.balance_due} invoiceLabel={selected.invoice_number ?? undefined} onClose={() => setSelected(null)} onDone={() => setSelected(null)} />}
    {account && <TakePaymentDialog tenantId={tenantId} presetCustomerId={customerId} onClose={() => setAccount(false)} />}
  </section>;
}
