import { ChevronLeft, ChevronRight, ImageOff, Plus } from "lucide-react";
import type { Product } from "@/features/shop/queries";
import { useProductImageUrls } from "@/features/shop/productImages";

interface Props {
  products: Product[];
  stockByProduct: Map<string, number>;
  onAdd: (p: Product) => void;
  loading?: boolean;
  /** 1-based current page. */
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function PosProductGrid({
  products, stockByProduct, onAdd, loading, page = 1, pageSize = 24, onPageChange,
}: Props) {
  const pageCount = Math.max(1, Math.ceil(products.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const visible = products.slice((current - 1) * pageSize, current * pageSize);
  const resolve = useProductImageUrls(visible.map((p) => p.image_url));


  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-sk-surface-muted" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed border-border py-20 text-center">
        <ImageOff className="mb-2 h-6 w-6 text-muted-foreground" />
        <div className="text-sm font-medium">No products here</div>
        <div className="text-xs text-muted-foreground">Try another category or clear the search.</div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {visible.map((p) => {
          const qty = stockByProduct.get(p.id) ?? 0;
          const low = p.reorder_level != null && qty <= Number(p.reorder_level);
          const out = qty <= 0;
          const img = resolve(p.image_url);
          return (
            <button
              key={p.id}
              onClick={() => onAdd(p)}
              className="group relative flex select-none flex-col overflow-hidden rounded-2xl border border-border bg-white text-left transition-transform active:scale-[0.98]"
            >
              <div className="relative aspect-[4/3] w-full bg-sk-surface-muted">
                {img ? (
                  <img src={img} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-2xl font-bold text-muted-foreground/60">
                    {initials(p.name)}
                  </div>
                )}
                <span
                  className={
                    "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                    (out
                      ? "bg-destructive text-destructive-foreground"
                      : low
                        ? "bg-amber-100 text-amber-900"
                        : "bg-white/90 text-muted-foreground")
                  }
                >
                  {out ? "Out of stock" : `${qty} in stock`}
                </span>
              </div>
              <div className="flex flex-1 items-end gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold leading-tight">{p.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{[p.variant_label, p.size_pack].filter(Boolean).join(" · ") || p.unit || p.sku || "each"}</div>
                  <div className="mt-1 text-base font-bold tabular-nums">
                    R {Number(p.sell_price ?? 0).toFixed(2)}
                  </div>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sk-coral text-white shadow-sm">
                  <Plus className="h-5 w-5" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={current <= 1}
            onClick={() => onPageChange?.(current - 1)}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <div className="text-sm font-semibold text-muted-foreground">
            Page {current} of {pageCount}
          </div>
          <button
            type="button"
            disabled={current >= pageCount}
            onClick={() => onPageChange?.(current + 1)}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

