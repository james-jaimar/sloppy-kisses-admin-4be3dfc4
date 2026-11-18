import { useState } from "react";
import { CreditCard, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useCustomerOpenInvoices } from "@/features/invoices/queries";
import { useCustomerCreditBalance } from "@/features/customerCredit/queries";
import { TakePaymentDialog } from "@/features/invoices/TakePaymentDialog";
import { fmtZar } from "@/features/invoices/status";
import { outstandingTotal } from "./invoiceSummary";

export function CustomerPaymentSummary({ tenantId, customerId }: { tenantId: string; customerId: string }) {
  const { hasPermission, profile } = useCurrentUser();
  const can = (code: string) => profile?.user_type === "platform" || hasPermission(code);
  const q = useCustomerOpenInvoices(can("invoices.view") ? tenantId : null, customerId);
  const credit = useCustomerCreditBalance(can("customer_credit.view") ? tenantId : null, customerId);
  const [open, setOpen] = useState(false);
  if (!can("invoices.view")) return null;
  const invoices = q.data ?? [];
  return <section className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-4">
    <div><h3 className="text-sm font-semibold">Customer outstanding invoices</h3>{q.isLoading ? <p className="text-muted-foreground">Loading…</p> : q.isError ? <Button variant="ghost" onClick={() => q.refetch()}><RotateCw />Balances unavailable · Retry</Button> : <p className="text-lg font-semibold">{fmtZar(outstandingTotal(invoices as any))}<span className="ml-2 text-sm font-normal text-muted-foreground">{invoices.length} invoice{invoices.length === 1 ? "" : "s"}</span></p>}
    {can("customer_credit.view") && <p className="text-xs text-muted-foreground">Available credit: {credit.isError ? "unavailable" : credit.isLoading ? "loading…" : fmtZar(credit.data ?? 0)}</p>}</div>
    {can("payments.create") && <Button disabled={q.isLoading || q.isError || !invoices.length} onClick={() => setOpen(true)}><CreditCard />Take payment</Button>}
    {open && <TakePaymentDialog tenantId={tenantId} presetCustomerId={customerId} onClose={() => setOpen(false)} />}
  </section>;
}
