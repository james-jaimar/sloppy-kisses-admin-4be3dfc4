import { Button } from "@/components/ui/button";
import { createPortal } from "react-dom";
import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { CustomerCombobox } from "@/components/customers/CustomerCombobox";
import { useCustomerOpenInvoices } from "./queries";
import { RecordPaymentDialog } from "./RecordPaymentDialog";

interface Props {
  tenantId: string;
  onClose: () => void;
  presetCustomerId?: string;
}

export function TakePaymentDialog({ tenantId, onClose, presetCustomerId }: Props) {
  const [customerId, setCustomerId] = useState<string | null>(presetCustomerId ?? null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [suggested, setSuggested] = useState(0);

  const openQ = useCustomerOpenInvoices(tenantId, customerId);
  const invoices = (openQ.data ?? []) as any[];

  const only = presetCustomerId && invoices.length === 1 && !openQ.isFetching && !openQ.isError ? invoices[0] : null;
  const selectedId = invoiceId ?? only?.id;
  if (selectedId && customerId) {
    return (
      <RecordPaymentDialog
        tenantId={tenantId}
        invoiceId={selectedId}
        customerId={customerId}
        suggested={invoiceId ? suggested : Number(only?.balance_due ?? 0)}
        onClose={onClose}
        onDone={onClose}
      />
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Take a payment</h2>
          <Button variant="ghost" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Customer</label>
            <CustomerCombobox
              tenantId={tenantId}
              value={customerId}
              inline={!customerId}
              autoFocus={!customerId}
              placeholder="Name, SK number, email, mobile…"
              onChange={(id) => { setCustomerId(id); setInvoiceId(null); }}
            />
          </div>

          {customerId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Outstanding invoices</label>
              {openQ.isLoading ? (
                <div className="flex items-center gap-2 px-1 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices…
                </div>
              ) : openQ.isError ? (<div className="text-destructive">Invoice information unavailable <Button variant="link" onClick={() => openQ.refetch()}>Retry</Button></div>) : invoices.length === 0 ? (
                <div className="rounded-lg bg-sk-surface-muted px-3 py-3 text-sm text-muted-foreground">
                  Nothing outstanding for this customer.
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {invoices.map((inv) => (
                    <Button variant="ghost"
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
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-4">
          <Button variant="ghost" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">
            Close
          </Button>
        </div>
      </div>
    </div>, document.body
  );
}