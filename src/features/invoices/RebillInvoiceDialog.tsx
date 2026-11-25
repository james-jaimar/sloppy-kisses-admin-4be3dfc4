import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fmtZar } from "./status";

const QUICK_REASONS = ["Puppy discount omitted", "Wrong package", "Wrong price", "Service changed"];

export function RebillInvoiceDialog({ open, onOpenChange, invoice }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: { id: string; invoice_number: string; total: number; balance_due: number };
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const settled = Math.max(0, Number(invoice.total) - Number(invoice.balance_due));

  async function run() {
    if (!reason.trim()) { toast.error("Please give a reason"); return; }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("rebill_invoice", { p_invoice_id: invoice.id, p_reason: reason.trim() });
      if (error) throw error;
      qc.invalidateQueries();
      toast.success("Replacement invoice created");
      onOpenChange(false);
      navigate(`/admin/invoices/${data}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not adjust invoice");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust &amp; re-bill {invoice.invoice_number}</DialogTitle>
          <DialogDescription>
            We'll fully credit this invoice and open an editable copy for you to fix.
            {settled > 0 && <> The {fmtZar(settled)} already paid is kept and settles the new invoice when you issue it.</>}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className={`rounded-full border px-3 py-1.5 text-sm ${reason === r ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border hover:bg-muted"}`}>
                {r}
              </button>
            ))}
          </div>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted">Cancel</button>
          <button type="button" onClick={run} disabled={busy || !reason.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Adjust &amp; re-bill
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
