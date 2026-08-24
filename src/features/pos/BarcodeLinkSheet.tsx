import { useMemo, useState } from "react";
import { Barcode, Check, Search, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@/features/shop/queries";
import { useLinkBarcode, useRecordUnknownBarcode } from "./barcodeQueries";

interface Props {
  tenantId: string;
  code: string;
  products: Product[];
  /** When false the user may only flag the code for admin. */
  canLink: boolean;
  onClose: () => void;
  /** Called after a successful link so the caller can add the product to the sale. */
  onLinked?: (product: Product) => void;
}

export default function BarcodeLinkSheet({ tenantId, code, products, canLink, onClose, onLinked }: Props) {
  const [term, setTerm] = useState("");
  const [note, setNote] = useState("");
  const link = useLinkBarcode(tenantId);
  const record = useRecordUnknownBarcode(tenantId);

  const matches = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return products.slice(0, 25);
    return products
      .filter((p) =>
        [p.name, p.sku, p.external_code, p.variant_label, p.size_pack].some((v) => v?.toLowerCase().includes(t)),
      )
      .slice(0, 40);
  }, [products, term]);

  async function pick(p: Product) {
    try {
      await link.mutateAsync({ code, productId: p.id });
      toast.success(`Barcode saved to ${p.name}`);
      onLinked?.({ ...p, barcode: code } as Product);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save that barcode");
    }
  }

  async function flag() {
    try {
      await record.mutateAsync({ code, note: note.trim() || null });
      toast.success("Flagged for admin");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not flag that barcode");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl">
        <header className="flex items-start gap-3 border-b border-border p-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sk-coral-soft text-sk-coral-dark">
            {canLink ? <Barcode className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{canLink ? "Link this barcode" : "Unknown item"}</div>
            <div className="break-all font-mono text-xl font-bold tabular-nums">{code}</div>
          </div>
          <button onClick={onClose} type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-border" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        {canLink ? (
          <>
            <div className="border-b border-border p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Search a product by name, SKU or Xero code…"
                  className="h-12 w-full rounded-xl border border-border bg-white pl-10 pr-3 text-base"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Pick the product this barcode belongs to. It scans straight through next time.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {matches.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No products match that search.</p>
              )}
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={link.isPending}
                  onClick={() => pick(p)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-sk-surface-muted disabled:opacity-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[p.sku, p.external_code, p.barcode ? `barcode ${p.barcode}` : null].filter(Boolean).join(" · ") || "No codes yet"}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">R {Number(p.price_incl_vat ?? p.price ?? 0).toFixed(2)}</div>
                  <Check className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">
              This code isn’t on any product yet and your role can’t link barcodes. Flag it and an admin will match it up.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Optional note — e.g. “Hills adult large 12kg”"
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={flag}
              disabled={record.isPending}
              className="h-12 w-full rounded-xl bg-sk-coral text-sm font-semibold text-white disabled:opacity-50"
            >
              Flag for admin
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
