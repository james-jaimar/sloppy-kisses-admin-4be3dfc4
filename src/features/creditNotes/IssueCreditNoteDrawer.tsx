import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { X, Plus, Trash2 } from "lucide-react";
import { useInvoice } from "@/features/invoices/queries";
import { useCreateCreditNote } from "./queries";
import { fmtZar } from "./status";

interface Props {
  tenantId: string;
  invoiceId: string;
  onClose: () => void;
}

type DraftLine = { description: string; quantity: number; unit_price: number };

export function IssueCreditNoteDrawer({ tenantId, invoiceId, onClose }: Props) {
  const navigate = useNavigate();
  const invQ = useInvoice(invoiceId, tenantId);
  const create = useCreateCreditNote(tenantId);
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const inv = invQ.data;

  useEffect(() => {
    if (!inv) return;
    if (mode === "full") {
      setLines(inv.items.map((it) => ({
        description: it.description,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
      })));
    } else if (lines.length === 0) {
      setLines([{ description: "", quantity: 1, unit_price: 0 }]);
    }
  }, [inv, mode]);

  const total = useMemo(
    () => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0),
    [lines],
  );

  async function submit() {
    if (!inv) return;
    const valid = lines.filter((l) => l.description.trim());
    if (valid.length === 0) { toast.error("Add at least one line"); return; }
    try {
      const id = await create.mutateAsync({
        customer_id: inv.customer_id,
        invoice_id: inv.id,
        reason: reason || null,
        notes: notes || null,
        items: valid,
      });
      toast.success("Draft credit note created");
      onClose();
      navigate(`/admin/credit-notes/${id}`);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-sm font-semibold">Issue credit note</div>
            <div className="text-xs text-muted-foreground">
              Against {inv?.invoice_number ?? "…"} · {inv?.customer?.full_name ?? ""}
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setMode("full")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${mode === "full" ? "border-sk-coral bg-sk-coral/10 font-semibold text-sk-coral-dark" : "border-border"}`}>
              Reverse full invoice
            </button>
            <button onClick={() => setMode("custom")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${mode === "custom" ? "border-sk-coral bg-sk-coral/10 font-semibold text-sk-coral-dark" : "border-border"}`}>
              Custom amount
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium">Reason</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Booking cancelled after invoicing"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lines</div>
              {mode === "custom" && (
                <button onClick={() => setLines([...lines, { description: "", quantity: 1, unit_price: 0 }])}
                  className="inline-flex items-center gap-1 rounded-lg bg-sk-coral px-2 py-1 text-xs font-semibold text-white hover:bg-sk-coral-dark">
                  <Plus className="h-3 w-3" /> Add line
                </button>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <input value={l.description} disabled={mode === "full"}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                    placeholder="Description"
                    className="col-span-6 h-9 rounded border border-border bg-white px-2 text-sm disabled:bg-muted" />
                  <input type="number" step="0.01" min={0} value={l.quantity} disabled={mode === "full"}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))}
                    className="col-span-2 h-9 rounded border border-border bg-white px-2 text-sm text-right tabular-nums disabled:bg-muted" />
                  <input type="number" step="0.01" min={0} value={l.unit_price} disabled={mode === "full"}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unit_price: Number(e.target.value) } : x))}
                    className="col-span-3 h-9 rounded border border-border bg-white px-2 text-sm text-right tabular-nums disabled:bg-muted" />
                  {mode === "custom" ? (
                    <button onClick={() => setLines(lines.filter((_, j) => j !== i))}
                      className="col-span-1 rounded border border-border text-sk-coral-dark hover:bg-muted">
                      <Trash2 className="h-3 w-3 mx-auto" />
                    </button>
                  ) : <div className="col-span-1" />}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium">Notes (optional)</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="border-t border-border px-5 py-4 flex items-center justify-between">
          <div className="text-sm">
            <span className="text-muted-foreground">Total: </span>
            <span className="font-semibold tabular-nums">{fmtZar(total)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 rounded-lg border border-border px-3 text-sm">Cancel</button>
            <button onClick={submit} disabled={create.isPending}
              className="h-9 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
              {create.isPending ? "Creating…" : "Create draft"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}