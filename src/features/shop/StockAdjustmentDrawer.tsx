import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCreateStockMovement, useStockLocations, type Product, type StockReason } from "./queries";

interface Props {
  tenantId: string;
  product: Product;
  defaultLocationId?: string | null;
  onClose: () => void;
}

const REASONS: { value: StockReason; label: string; sign: 1 | -1 }[] = [
  { value: "receive", label: "Receive stock", sign: 1 },
  { value: "adjustment", label: "Count correction", sign: 1 },
  { value: "wastage", label: "Wastage / damage", sign: -1 },
  { value: "return", label: "Customer return", sign: 1 },
];

export default function StockAdjustmentDrawer({ tenantId, product, defaultLocationId, onClose }: Props) {
  const locsQ = useStockLocations(tenantId);
  const create = useCreateStockMovement(tenantId);

  const [reason, setReason] = useState<StockReason>("receive");
  const [qty, setQty] = useState<string>("1");
  const [locationId, setLocationId] = useState<string>(defaultLocationId ?? "");
  const [notes, setNotes] = useState("");

  async function save() {
    const n = Number(qty);
    if (!n || isNaN(n)) { toast.error("Enter a quantity"); return; }
    if (!locationId) { toast.error("Choose a location"); return; }
    const cfg = REASONS.find((r) => r.value === reason)!;
    const delta = cfg.sign * Math.abs(n) * (reason === "adjustment" && n < 0 ? -1 : 1);
    try {
      await create.mutateAsync({
        product_id: product.id, location_id: locationId,
        qty_delta: reason === "adjustment" ? n : delta,
        reason, notes: notes || null,
      });
      toast.success("Stock updated");
      onClose();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  return (
    <ModalShell
      title="Adjust stock"
      subtitle={product.name}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-lg border border-border px-3 text-sm">Cancel</button>
          <button onClick={save} disabled={create.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white disabled:opacity-50">
            <Save className="h-4 w-4" /> Save movement
          </button>
        </div>
      }
    >
      <div className="grid gap-4 p-6">
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason</div>
          <select value={reason} onChange={(e) => setReason(e.target.value as StockReason)}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</div>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
            <option value="">Select…</option>
            {(locsQ.data ?? []).filter((l) => l.active).map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.is_default ? " (default)" : ""}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quantity {reason === "adjustment" && <span className="ml-1 text-[10px] font-normal">(use negative to reduce)</span>}
          </div>
          <input type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</div>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
        </label>
      </div>
    </ModalShell>
  );
}