import { createPortal } from "react-dom";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { useRecordPayment, usePaymentMethods, useCustomerOpenInvoices } from "./queries";

interface Props {
  tenantId: string;
  invoiceId: string;
  customerId: string;
  suggested: number;
  invoiceLabel?: string;
  onClose: () => void;
  onDone: () => void;
}

export function RecordPaymentDialog({ tenantId, invoiceId, customerId, suggested, invoiceLabel, onClose, onDone }: Props) {
  const { hasPermission, profile } = useCurrentUser();
  const canRecord = profile?.user_type === "platform" || hasPermission("payments.create");
  const methodsQ = usePaymentMethods(tenantId, { activeOnly: true });
  const openQ = useCustomerOpenInvoices(tenantId, customerId);
  const record = useRecordPayment(tenantId);
  const [amount, setAmount] = useState<number>(suggested);
  const [method, setMethod] = useState<string>("eft");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [allocs, setAllocs] = useState<Record<string, number>>({ [invoiceId]: suggested });

  const openInvoices = (openQ.data ?? []) as any[];
  const selectedInvoice = openInvoices.find(inv => inv.id === invoiceId);
  const methodAvailable = (methodsQ.data ?? []).some(m => m.code === method);
  const multi = openInvoices.length > 1;
  const allocatedSum = Object.values(allocs).reduce((s, n) => s + (Number(n) || 0), 0);
  const remainder = Math.round((amount - allocatedSum) * 100) / 100;

  function setAlloc(id: string, v: number) {
    setAllocs((prev) => ({ ...prev, [id]: v }));
  }
  function autoFill() {
    let left = amount;
    const next: Record<string, number> = {};
    for (const inv of openInvoices) {
      const bal = Number(inv.balance_due ?? 0);
      const take = Math.min(left, bal);
      next[inv.id] = Math.round(take * 100) / 100;
      left = Math.round((left - take) * 100) / 100;
      if (left <= 0) break;
    }
    setAllocs(next);
  }

  async function submit() {
    if (!canRecord || openQ.isFetching || openQ.isError || record.isPending || !selectedInvoice || !methodAvailable) return;
    if (!amount || amount <= 0) { toast.error("Amount must be greater than zero"); return; }
    if (multi && allocatedSum > amount + 0.005) { toast.error("Allocations exceed payment amount"); return; }
    try {
      const allocations = multi
        ? Object.entries(allocs)
            .map(([invoice_id, a]) => ({ invoice_id, amount: Number(a) || 0 }))
            .filter((a) => a.amount > 0)
        : null;
      await record.mutateAsync({
        invoice_id: invoiceId,
        customer_id: customerId,
        amount,
        payment_method: method as any,
        payment_reference: ref || null,
        paid_at: new Date(date).toISOString(),
        notes: notes || null,
        allocations,
      });
      toast.success(
        remainder > 0.005 && multi
          ? `Payment recorded — R${remainder.toFixed(2)} parked to customer credit`
          : "Payment recorded"
      );
      onDone();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div><h2 className="text-lg font-semibold">Record payment</h2><p className="text-sm text-muted-foreground">{invoiceLabel ?? openInvoices.find(inv => inv.id === invoiceId)?.invoice_number}</p></div>
          <Button variant="ghost" aria-label="Close payment" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4 p-5 overflow-y-auto">
          {methodsQ.isError && <p className="text-destructive">Payment methods unavailable. <Button variant="link" onClick={() => methodsQ.refetch()}>Retry</Button></p>}
          {openQ.isError && <p className="text-destructive">Could not load current balances. <Button variant="link" onClick={() => openQ.refetch()}>Retry</Button></p>}
          <Field label="Amount (ZAR)">
            <input type="number" step="0.01" min={0} value={amount}
              onChange={(e) => { const value = Number(e.target.value); setAmount(value); if (Object.entries(allocs).every(([id, a]) => id === invoiceId || a === 0)) setAllocs({ [invoiceId]: Math.min(value, Number(selectedInvoice?.balance_due ?? suggested)) }); }}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </Field>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Method</div>
            <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(methodsQ.data ?? []).map(m => ({ code: m.code, label: m.code === "yoko" ? "Yoco card" : m.label })).map((m) => (
                <Button variant={method === m.code ? "default" : "outline"} key={m.code} type="button" role="radio" aria-checked={method === m.code} onClick={() => setMethod(m.code)}
                  className={`h-11 rounded-lg border text-sm font-semibold ${method === m.code ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}>
                  {m.label}
                </Button>
              ))}
            </div>
            {method === "yoko" && <p className="mt-2 text-xs text-muted-foreground">Yoco card · manual recording</p>}
          </div>
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

          {multi && (
            <div className="rounded-lg border border-border bg-sk-surface-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Allocate across invoices
                </div>
                <Button type="button" onClick={autoFill}
                  className="text-xs font-semibold text-sk-coral-dark hover:underline">
                  Auto-fill oldest first
                </Button>
              </div>
              <div className="space-y-2">
                {openInvoices.map((inv) => {
                  const bal = Number(inv.balance_due ?? 0);
                  return (
                    <div key={inv.id} className="flex items-center gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{inv.invoice_number ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          Balance R{bal.toFixed(2)}
                        </div>
                      </div>
                      <input type="number" step="0.01" min={0} max={bal}
                        value={allocs[inv.id] ?? 0}
                        onChange={(e) => setAlloc(inv.id, Number(e.target.value))}
                        className="h-9 w-28 rounded-lg border border-border bg-white px-2 text-right text-sm" />
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">Allocated R{allocatedSum.toFixed(2)} of R{amount.toFixed(2)}</span>
                <span className={remainder > 0.005 ? "font-semibold text-sk-teal" : remainder < -0.005 ? "font-semibold text-sk-coral-dark" : "text-muted-foreground"}>
                  {remainder > 0.005 ? `R${remainder.toFixed(2)} → customer credit`
                    : remainder < -0.005 ? `Over-allocated by R${Math.abs(remainder).toFixed(2)}`
                    : "Fully allocated"}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm">Cancel</Button>
          <Button disabled={record.isPending || openQ.isFetching || openQ.isError || !canRecord || !selectedInvoice || !methodAvailable} onClick={submit}
            className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
            {record.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Record
          </Button>
        </div>
      </div>
    </div>, document.body
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