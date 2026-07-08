import { useMemo, useState } from "react";
import { PackagePlus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useProducts, useStockLocations, useStockOnHand, type Product } from "./queries";
import StockAdjustmentDrawer from "./StockAdjustmentDrawer";

export default function StockPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;

  const locsQ = useStockLocations(tenantId);
  const defaultLoc = (locsQ.data ?? []).find((l) => l.is_default && l.active) ?? (locsQ.data ?? [])[0] ?? null;
  const [locationId, setLocationId] = useState<string>("");
  const effectiveLoc = locationId || defaultLoc?.id || "";

  const productsQ = useProducts(tenantId, { activeOnly: true });
  const stockQ = useStockOnHand(tenantId, effectiveLoc || null);

  const [adjust, setAdjust] = useState<Product | null>(null);

  const stockByProduct = useMemo(() => {
    const m = new Map<string, { qty: number; last: string | null }>();
    (stockQ.data ?? []).forEach((r) => m.set(r.product_id, { qty: Number(r.qty_on_hand), last: r.last_movement_at }));
    return m;
  }, [stockQ.data]);

  const rows = productsQ.data ?? [];
  const lowCount = rows.filter((p) => {
    if (p.reorder_level == null) return false;
    const qty = stockByProduct.get(p.id)?.qty ?? 0;
    return qty <= Number(p.reorder_level);
  }).length;

  return (
    <>
      <AppHeader title="Stock levels" subtitle="Current on-hand per product. Adjust to receive, waste, or correct." />
      <div className="flex-1 p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <select value={effectiveLoc} onChange={(e) => setLocationId(e.target.value)}
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm">
            {(locsQ.data ?? []).filter((l) => l.active).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <div className="text-xs text-muted-foreground">
            {rows.length} products · <span className={lowCount ? "font-semibold text-sk-coral-dark" : ""}>{lowCount} low stock</span>
          </div>
        </div>

        <div className="sk-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3 text-right">On hand</th>
                <th className="px-5 py-3 text-right">Reorder at</th>
                <th className="px-5 py-3">Last movement</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No active products.</td></tr>
              )}
              {rows.map((p) => {
                const info = stockByProduct.get(p.id);
                const qty = info?.qty ?? 0;
                const low = p.reorder_level != null && qty <= Number(p.reorder_level);
                return (
                  <tr key={p.id} className="hover:bg-sk-surface-muted/40">
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{p.sku ?? "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <span className={low ? "font-semibold text-sk-coral-dark" : ""}>{qty}</span>
                      {low && <span className="ml-2 rounded-full bg-sk-coral-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-sk-coral-dark">Low</span>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{p.reorder_level ?? "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{info?.last ? new Date(info.last).toLocaleString() : "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => setAdjust(p)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1 text-xs">
                        <PackagePlus className="h-3.5 w-3.5" /> Adjust
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {adjust && tenantId && (
        <StockAdjustmentDrawer
          tenantId={tenantId}
          product={adjust}
          defaultLocationId={effectiveLoc}
          onClose={() => setAdjust(null)}
        />
      )}
    </>
  );
}