import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { useApplyCreditNote, useOpenInvoicesForCustomer, type CreditNoteDetail } from "./queries";
import { fmtZar } from "./status";

interface Props {
  tenantId: string;
  cn: CreditNoteDetail;
  onClose: () => void;
}

export function ApplyCreditDialog({ tenantId, cn, onClose }: Props) {
  const invoicesQ = useOpenInvoicesForCustomer(tenantId, cn.customer_id);
  const apply = useApplyCreditNote(tenantId);
  const [invoiceId, setInvoiceId] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);

  const balance = Number(cn.balance ?? 0);
  const chosen = (invoicesQ.data ?? []).find((i: any) => i.id === invoiceId);
  const maxAmount = chosen ? Math.min(balance, Number(chosen.balance_due)) : balance;

  useEffect(() => {
    if (chosen) setAmount(Number(Math.min(balance, Number(chosen.balance_due)).toFixed(2)));
  }, [invoiceId]);

  async function submit() {
    if (!invoiceId) { toast.error("Choose an invoice"); return; }
    if (!(amount > 0)) { toast.error("Amount must be > 0"); return; }
    try {
      await apply.mutateAsync({ credit_note_id: cn.id, invoice_id: invoiceId, amount });
      toast.success("Credit applied");
      onClose();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold">Apply credit</div>
            <div className="text-xs text-muted-foreground">{cn.credit_note_number} · Available {fmtZar(balance)}</div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium">Invoice</label>
          {invoicesQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : (invoicesQ.data ?? []).length === 0 ? (
            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">No open invoices for this customer.</div>
          ) : (
            <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-white px-2 text-sm">
              <option value="">Select…</option>
              {(invoicesQ.data ?? []).map((i: any) => (
                <option key={i.id} value={i.id}>
                  {i.invoice_number} — balance {fmtZar(i.balance_due)}
                </option>
              ))}
            </select>
          )}

          <label className="block text-xs font-medium">Amount</label>
          <input type="number" step="0.01" min={0} max={maxAmount} value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm tabular-nums" />
          <div className="text-xs text-muted-foreground">Max: {fmtZar(maxAmount)}</div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-lg border border-border px-3 text-sm">Cancel</button>
          <button onClick={submit} disabled={apply.isPending || !invoiceId || amount <= 0}
            className="h-9 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
            {apply.isPending ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}