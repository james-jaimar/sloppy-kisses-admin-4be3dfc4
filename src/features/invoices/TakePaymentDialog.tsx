import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { CustomerCombobox } from "@/components/customers/CustomerCombobox";
import { useCustomerOpenInvoices } from "./queries";
import { RecordPaymentDialog } from "./RecordPaymentDialog";

interface Props {
  tenantId: string;
  onClose: () => void;
}

export function TakePaymentDialog({ tenantId, onClose }: Props) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [suggested, setSuggested] = useState(0);

  const openQ = useCustomerOpenInvoices(tenantId, customerId);
  const invoices = (openQ.data ?? []) as any[];

  if (invoiceId && customerId) {
    return (
      <RecordPaymentDialog
        tenantId={tenantId}
        invoiceId={invoiceId}
        customerId={customerId}
        suggested={suggested}
        onClose={() => setInvoiceId(null)}
        onDone={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Take a payment</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Customer</label>
            <div className="flex items-center gap-2 rounded-lg border border-border px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={term}
                onChange={(e) => { setTerm(e.target.value); setCustomerId(null); }}
                placeholder="Name, SK number, email, mobile…"
                className="h-10 w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border">
              {customersQ.isLoading && (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              )}
              {!customersQ.isLoading && customers.length === 0 && (
                <div className="px-3 py-4 text-sm text-muted-foreground">No matching customer</div>
              )}
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCustomerId(c.id)}
                  className={
                    "flex w-full flex-col items-start px-3 py-2 text-left hover:bg-sk-surface-muted " +
                    (c.id === customerId ? "bg-sk-coral-soft/40" : "")
                  }
                >
                  <span className="text-sm font-medium">{c.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[c.customer_number, c.email ?? c.mobile].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {customerId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Outstanding invoices</label>
              {openQ.isLoading ? (
                <div className="flex items-center gap-2 px-1 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices…
                </div>
              ) : invoices.length === 0 ? (
                <div className="rounded-lg bg-sk-surface-muted px-3 py-3 text-sm text-muted-foreground">
                  Nothing outstanding for this customer.
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {invoices.map((inv) => (
                    <button
                      key={inv.id}
                      onClick={() => {
                        setSuggested(Number(inv.balance_due ?? 0));
                        setInvoiceId(inv.id);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-sk-surface-muted"
                    >
                      <span className="text-sm">
                        <span className="font-medium">{inv.invoice_number}</span>
                        <span className="ml-2 text-xs capitalize text-muted-foreground">
                          {String(inv.status ?? "").replace(/_/g, " ")}
                          {inv.due_date ? ` · due ${inv.due_date}` : ""}
                        </span>
                      </span>
                      <span className="text-sm font-semibold">R{Number(inv.balance_due ?? 0).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}