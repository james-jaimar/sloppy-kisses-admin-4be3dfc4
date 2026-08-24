import { Minus, Percent, Plus, Trash2, User, X } from "lucide-react";
import { useProductImageUrls } from "@/features/shop/productImages";
import { cartTotal, lineTotal, lineUnitPrice, vatPortion, type PosLine } from "./queries";


interface Props {
  lines: PosLine[];
  discount: number;
  customerLabel: string;
  onChangeQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onDiscount: () => void;
  onClearDiscount: () => void;
  onPickCustomer: () => void;
  onCharge: () => void;
  onQuickTender: (method: "cash" | "card") => void;
  saleNumberHint?: string;
  busy?: boolean;
}

export default function PosSalePanel({
  lines, discount, customerLabel, onChangeQty, onRemove, onDiscount, onClearDiscount,
  onPickCustomer, onCharge, onQuickTender, saleNumberHint, busy,
}: Props) {
  const subtotal = cartTotal(lines);
  const total = Math.max(0, Number((subtotal - discount).toFixed(2)));
  const vat = vatPortion(lines);
  const resolveImage = useProductImageUrls(lines.map((l) => l.product.image_url));

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">

      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Current sale</div>
          <div className="text-[11px] text-muted-foreground">{saleNumberHint ?? "New sale"}</div>
        </div>
        <button
          onClick={onPickCustomer}
          className="inline-flex h-9 max-w-[55%] items-center gap-1.5 truncate rounded-full border border-border px-3 text-xs font-medium"
        >
          <User className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{customerLabel}</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {lines.length === 0 && (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">
            Scan a barcode or tap a product to start.
          </div>
        )}
        {lines.map((l) => {
          const img = resolveImage(l.product.image_url);
          return (
          <div key={l.product.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-sk-surface-muted/50">
            <div className="grid aspect-square h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-sk-surface-muted text-xs font-bold text-muted-foreground">
              {img ? (
                <img src={img} alt="" className="h-full w-full object-contain" />
              ) : (
                l.product.name.slice(0, 2).toUpperCase()
              )}

            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{l.product.name}</div>
              <div className="text-[11px] tabular-nums text-muted-foreground">
                R {lineUnitPrice(l).toFixed(2)} each
                {l.qty < 0 && <span className="ml-1 font-semibold text-sk-coral-dark">· return</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onChangeQty(l.product.id, l.qty - 1)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-border"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
              <button
                onClick={() => onChangeQty(l.product.id, l.qty + 1)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-border"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
              R {lineTotal(l).toFixed(2)}
            </div>
            <button
              onClick={() => onRemove(l.product.id)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-sk-coral-dark"
              aria-label="Remove line"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-4 space-y-3">
        <button
          onClick={discount > 0 ? onClearDiscount : onDiscount}
          className="flex w-full items-center justify-between rounded-xl border border-dashed border-border px-3 py-2 text-sm"
        >
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Percent className="h-4 w-4" /> {discount > 0 ? "Discount applied" : "Add discount"}
          </span>
          <span className="inline-flex items-center gap-2 font-semibold tabular-nums">
            {discount > 0 ? `− R ${discount.toFixed(2)}` : ""}
            {discount > 0 && <X className="h-3.5 w-3.5" />}
          </span>
        </button>

        <div className="space-y-1 text-sm">
          <Row label="Subtotal" value={subtotal} />
          {discount > 0 && <Row label="Discount" value={-discount} />}
          <Row label={`VAT included`} value={vat} muted />
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-3xl font-bold tabular-nums">R {total.toFixed(2)}</span>
          </div>
        </div>

        <button
          onClick={onCharge}
          disabled={busy || lines.length === 0}
          className="h-16 w-full rounded-2xl bg-sk-coral text-lg font-bold text-white shadow-sm transition-transform active:scale-[0.99] disabled:opacity-40"
        >
          Charge R {total.toFixed(2)}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onQuickTender("cash")}
            disabled={busy || lines.length === 0}
            className="h-12 rounded-xl border border-border text-sm font-semibold disabled:opacity-40"
          >
            Cash
          </button>
          <button
            onClick={() => onQuickTender("card")}
            disabled={busy || lines.length === 0}
            className="h-12 rounded-xl border border-border text-sm font-semibold disabled:opacity-40"
          >
            Card
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={"flex items-center justify-between " + (muted ? "text-muted-foreground" : "")}>
      <span>{label}</span>
      <span className="tabular-nums">R {value.toFixed(2)}</span>
    </div>
  );
}
