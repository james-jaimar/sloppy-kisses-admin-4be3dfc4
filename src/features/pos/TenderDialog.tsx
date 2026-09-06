import { useMemo, useState } from "react";
import { Banknote, CreditCard, Delete, Plus, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { usePaymentMethods } from "@/features/invoices/queries";
import type { PosTender } from "./queries";

interface Props {
  tenantId: string;
  total: number;
  /** Charge-to-account is only possible for a real (non walk-in) customer. */
  allowAccount: boolean;
  initialMethod?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (tenders: PosTender[], chargeToAccount: boolean) => void;
}

const QUICK_NOTES = [50, 100, 200, 500];

export default function TenderDialog({ tenantId, total, allowAccount, initialMethod, busy, onClose, onConfirm }: Props) {
  const methodsQ = usePaymentMethods(tenantId, { activeOnly: true });
  const methods = useMemo(() => {
    const rows = (methodsQ.data ?? []) as any[];
    if (rows.length) return rows.map((m) => ({ code: m.code as string, label: m.label as string }));
    return [
      { code: "cash", label: "Cash" },
      { code: "card", label: "Card" },
      { code: "eft", label: "EFT" },
    ];
  }, [methodsQ.data]);

  const [tenders, setTenders] = useState<PosTender[]>([]);
  const [method, setMethod] = useState<string>(initialMethod ?? "cash");
  const [entry, setEntry] = useState<string>("");
  const [reference, setReference] = useState("");

  const taken = tenders.reduce((s, t) => s + t.amount, 0);
  const outstanding = Number(Math.max(0, total - taken).toFixed(2));
  const entryNum = Number(entry || 0);
  const isCash = method === "cash";
  const change = isCash && entryNum > outstanding ? Number((entryNum - outstanding).toFixed(2)) : 0;

  function press(k: string) {
    if (k === "back") return setEntry((e) => e.slice(0, -1));
    if (k === "clear") return setEntry("");
    if (k === "." && entry.includes(".")) return;
    setEntry((e) => (e === "0" ? k : e + k));
  }

  function addTender() {
    const amount = entry === "" ? outstanding : Math.min(entryNum, outstanding);
    if (amount <= 0) {
      toast.error("Enter an amount");
      return;
    }
    setTenders((t) => [
      ...t,
      { method, amount: Number(amount.toFixed(2)), reference: reference || null, tendered: isCash ? Math.max(entryNum, amount) : null },
    ]);
    setEntry("");
    setReference("");
  }

  function finish() {
    const list = tenders.length
      ? tenders
      : [{ method, amount: Number((entry === "" ? total : Math.min(entryNum, total)).toFixed(2)), reference: reference || null, tendered: isCash ? Math.max(entryNum, total) : null }];
    const sum = list.reduce((s, t) => s + t.amount, 0);
    if (sum + 0.001 < total) {
      toast.error(`Still R ${(total - sum).toFixed(2)} to pay`);
      return;
    }
    onConfirm(list, false);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border bg-white px-4 py-2 xl:px-5 xl:py-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Take payment</div>
          <div className="text-xl font-bold tabular-nums xl:text-2xl">R {total.toFixed(2)}</div>
        </div>
        <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-border" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3 md:flex-row xl:gap-4 xl:p-5">
        {/* Keypad */}
        <div className="flex-1">
          <div className="mb-3 flex flex-wrap gap-2">
            {methods.map((m) => (
              <button
                key={m.code}
                onClick={() => setMethod(m.code)}
                className={
                  "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold xl:h-12 xl:rounded-xl xl:px-4 " +
                  (method === m.code ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white")
                }
              >
                {m.code === "cash" ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                {m.label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-white p-3 xl:rounded-2xl xl:p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {isCash ? "Cash tendered" : "Amount"}
              </span>
              <span className="text-2xl font-bold tabular-nums xl:text-3xl">R {(entry === "" ? outstanding : entryNum).toFixed(2)}</span>
            </div>

            <div className="mb-3 grid grid-cols-4 gap-2">
              <button onClick={() => setEntry(String(outstanding))} className="h-11 rounded-xl border border-border text-sm font-semibold">Exact</button>
              {QUICK_NOTES.map((n) => (
                <button key={n} onClick={() => setEntry(String(n))} className="h-11 rounded-xl border border-border text-sm font-semibold">R{n}</button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"].map((k) => (
                 <button key={k} onClick={() => press(k)} className="h-12 rounded-lg border border-border bg-white text-xl font-semibold active:bg-sk-surface-muted xl:h-16 xl:rounded-xl xl:text-2xl">
                  {k}
                </button>
              ))}
              <button onClick={() => press("back")} className="grid h-12 place-items-center rounded-lg border border-border bg-white active:bg-sk-surface-muted xl:h-16 xl:rounded-xl">
                <Delete className="h-6 w-6" />
              </button>
            </div>

            {!isCash && (
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Reference (optional)"
                className="mt-3 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
              />
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="w-full md:w-80 xl:w-96">
          <div className="rounded-2xl border border-border bg-white p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tenders</div>
            {tenders.length === 0 && <div className="text-sm text-muted-foreground">Nothing captured yet.</div>}
            {tenders.map((t, i) => (
              <div key={i} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-b-0">
                <span className="capitalize">{t.method}</span>
                <span className="flex items-center gap-2 tabular-nums font-semibold">
                  R {t.amount.toFixed(2)}
                  <button onClick={() => setTenders((list) => list.filter((_, j) => j !== i))} aria-label="Remove tender">
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </span>
              </div>
            ))}

            <button onClick={addTender} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold">
              <Plus className="h-4 w-4" /> Add as split payment
            </button>

            <div className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="tabular-nums">R {total.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Captured</span><span className="tabular-nums">R {taken.toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold"><span>Still to pay</span><span className="tabular-nums">R {outstanding.toFixed(2)}</span></div>
            </div>

            {change > 0 && (
              <div className="mt-4 rounded-xl bg-sk-coral-soft p-4 text-center">
                <div className="text-xs font-semibold uppercase tracking-wide text-sk-coral-dark">Change due</div>
                <div className="text-4xl font-bold tabular-nums text-sk-coral-dark">R {change.toFixed(2)}</div>
              </div>
            )}
          </div>

          <button
            onClick={finish}
            disabled={busy}
            className="mt-3 h-12 w-full rounded-xl bg-sk-coral text-base font-bold text-white disabled:opacity-40 xl:h-16 xl:rounded-2xl xl:text-lg"
          >
            {busy ? "Processing…" : "Complete sale"}
          </button>

          {allowAccount && (
            <button
              onClick={() => onConfirm([], true)}
              disabled={busy}
              className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold disabled:opacity-40"
            >
              <UserCheck className="h-4 w-4" /> Charge to account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
