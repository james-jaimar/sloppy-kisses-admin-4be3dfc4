import { useState } from "react";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { useAllocateCustomerCredit, useCustomerCreditBalance } from "./queries";
import { fmtZar } from "@/features/invoices/status";

export function AllocateCreditDialog({
  tenantId,
  customerId,
  invoiceId,
  invoiceNumber,
  invoiceBalance,
  onClose,
}: {
  tenantId: string;
  customerId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceBalance: number;
  onClose: () => void;
}) {
  const balQ = useCustomerCreditBalance(tenantId, customerId);
  const allocate = useAllocateCustomerCredit(tenantId);
  const max = Math.min(Number(balQ.data ?? 0), invoiceBalance);
  const [amount, setAmount] = useState<number>(max || 0);
  const [notes, setNotes] = useState("");

  async function submit() {
    if (amount <= 0) { toast.error("Amount must be greater than zero"); return; }
    try {
      await allocate.mutateAsync({
        customer_id: customerId, invoice_id: invoiceId, amount, notes: notes || null,
      });
      toast.success(`Applied ${fmtZar(amount)} of credit to ${invoiceNumber}`);
      onClose();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="text-sm font-semibold">Apply customer credit</div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-lg bg-sk-surface-muted p-3 text-xs">
            <div className="flex justify-between"><span>Credit balance</span><span className="font-semibold tabular-nums">{fmtZar(balQ.data ?? 0)}</span></div>
            <div className="mt-1 flex justify-between"><span>Invoice {invoiceNumber} balance</span><span className="font-semibold tabular-nums">{fmtZar(invoiceBalance)}</span></div>
          </div>
          <label className="block text-xs font-medium">
            Amount to apply
            <input type="number" min={0} max={max} step="0.01" value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm tabular-nums" />
            <div className="mt-1 text-[11px] text-muted-foreground">Max: {fmtZar(max)}</div>
          </label>
          <label className="block text-xs font-medium">
            Notes (optional)
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm">Cancel</button>
          <button onClick={submit} disabled={allocate.isPending || max <= 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sk-coral px-3 py-1.5 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
            {allocate.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Apply credit
          </button>
        </div>
      </div>
    </div>
  );
}