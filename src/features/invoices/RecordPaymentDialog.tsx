import { useState } from "react";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { useRecordPayment, usePaymentMethods } from "./queries";

interface Props {
  tenantId: string;
  invoiceId: string;
  customerId: string;
  suggested: number;
  onClose: () => void;
  onDone: () => void;
}

export function RecordPaymentDialog({ tenantId, invoiceId, customerId, suggested, onClose, onDone }: Props) {
  const methodsQ = usePaymentMethods(tenantId, { activeOnly: true });
  const record = useRecordPayment(tenantId);
  const [amount, setAmount] = useState<number>(suggested);
  const [method, setMethod] = useState<string>("eft");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  async function submit() {
    if (!amount || amount <= 0) { toast.error("Amount must be greater than zero"); return; }
    try {
      await record.mutateAsync({
        invoice_id: invoiceId,
        customer_id: customerId,
        amount,
        payment_method: method as any,
        payment_reference: ref || null,
        paid_at: new Date(date).toISOString(),
        notes: notes || null,
      });
      toast.success("Payment recorded");
      onDone();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Record payment</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Amount (ZAR)">
            <input type="number" step="0.01" min={0} value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </Field>
          <Field label="Method">
            <select value={method} onChange={(e) => setMethod(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
              {(methodsQ.data ?? []).map((m: any) => (
                <option key={m.id} value={m.code}>{m.label}</option>
              ))}
              {(methodsQ.data ?? []).length === 0 && (
                <>
                  <option value="cash">Cash</option>
                  <option value="eft">EFT</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </>
              )}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </Field>
          <Field label="Reference (optional)">
            <input value={ref} onChange={(e) => setRef(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </Field>
          <Field label="Notes (optional)">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm">Cancel</button>
          <button disabled={record.isPending} onClick={submit}
            className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
            {record.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Record
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}