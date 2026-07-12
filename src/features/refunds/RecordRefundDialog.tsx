import { useState } from "react";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { useRecordManualRefund } from "./queries";
import { usePaymentMethods } from "@/features/invoices/queries";
import { supabase } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface Props {
  tenantId: string;
  payment: {
    id: string;
    amount: number;
    amount_refunded?: number | null;
    payment_method: string;
    customer_id: string | null;
    invoice_id: string | null;
  };
  defaultCreditNoteId?: string | null;
  onClose: () => void;
  onDone: () => void;
}

export function RecordRefundDialog({ tenantId, payment, defaultCreditNoteId, onClose, onDone }: Props) {
  const remaining = Math.max(0, Number(payment.amount) - Number(payment.amount_refunded ?? 0));
  const methodsQ = usePaymentMethods(tenantId, { activeOnly: true });
  const record = useRecordManualRefund(tenantId);
  const [amount, setAmount] = useState<number>(remaining);
  const [method, setMethod] = useState<string>(payment.payment_method || "eft");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [creditNoteId, setCreditNoteId] = useState<string>(defaultCreditNoteId ?? "");

  // Customer's issued CNs with a balance, for optional linking
  const cnsQ = useQuery({
    queryKey: ["refund_dialog_cns", tenantId, payment.customer_id],
    enabled: Boolean(payment.customer_id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("credit_notes")
        .select("id, credit_note_number, status, balance")
        .eq("tenant_id", tenantId)
        .eq("customer_id", payment.customer_id)
        .in("status", ["issued", "applied"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function submit() {
    if (!amount || amount <= 0) { toast.error("Amount must be greater than zero"); return; }
    if (amount > remaining + 0.001) { toast.error(`Amount exceeds remaining refundable (R${remaining.toFixed(2)})`); return; }
    try {
      await record.mutateAsync({
        payment_id: payment.id,
        amount,
        method: (method as any) || null,
        reference: ref || null,
        credit_note_id: creditNoteId || null,
        notes: notes || null,
        refund_date: date,
      });
      toast.success("Refund recorded");
      onDone();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Record refund</h2>
            <div className="text-xs text-muted-foreground">
              Payment R{Number(payment.amount).toFixed(2)} · Refundable R{remaining.toFixed(2)}
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Amount (ZAR)">
            <input type="number" step="0.01" min={0} max={remaining} value={amount}
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
          <Field label="Refund date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </Field>
          <Field label="Reference (optional)">
            <input value={ref} onChange={(e) => setRef(e.target.value)}
              placeholder="Bank txn ref or gateway id"
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </Field>
          <Field label="Link to credit note (optional)">
            <select value={creditNoteId} onChange={(e) => setCreditNoteId(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
              <option value="">— none —</option>
              {(cnsQ.data ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.credit_note_number} — bal R{Number(c.balance).toFixed(2)}
                </option>
              ))}
            </select>
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
            {record.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Record refund
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