import { useState } from "react";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { useAdjustCustomerCredit, useParkCustomerCredit } from "./queries";

export function CreditAdjustmentDialog({
  tenantId, customerId, onClose,
}: {
  tenantId: string; customerId: string; onClose: () => void;
}) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const park = useParkCustomerCredit(tenantId);
  const adjust = useAdjustCustomerCredit(tenantId);
  const pending = park.isPending || adjust.isPending;

  async function submit() {
    if (amount <= 0) { toast.error("Amount must be positive"); return; }
    if (!notes.trim()) { toast.error("Please add a note explaining the adjustment"); return; }
    try {
      if (direction === "add") {
        await park.mutateAsync({ customer_id: customerId, amount, notes });
      } else {
        await adjust.mutateAsync({ customer_id: customerId, amount: -amount, notes });
      }
      toast.success("Adjustment saved");
      onClose();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="text-sm font-semibold">Adjust customer credit</div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
            <button onClick={() => setDirection("add")}
              className={"rounded-md px-3 py-1.5 " + (direction === "add" ? "bg-sk-coral text-white" : "text-muted-foreground")}>
              Add credit
            </button>
            <button onClick={() => setDirection("remove")}
              className={"rounded-md px-3 py-1.5 " + (direction === "remove" ? "bg-sk-coral text-white" : "text-muted-foreground")}>
              Remove credit
            </button>
          </div>
          <label className="block text-xs font-medium">
            Amount (ZAR)
            <input type="number" min={0} step="0.01" value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm tabular-nums" />
          </label>
          <label className="block text-xs font-medium">
            Note (required — will appear in the ledger)
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm">Cancel</button>
          <button onClick={submit} disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sk-coral px-3 py-1.5 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save
          </button>
        </div>
      </div>
    </div>
  );
}