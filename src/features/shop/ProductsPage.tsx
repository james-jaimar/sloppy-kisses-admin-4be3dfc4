import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useDefaultLocation, useProducts, useProductCategories, useStockOnHand, type Product } from "./queries";
import ProductFormModal from "./ProductFormModal";

export default function ProductsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const listQ = useProducts(tenantId, { search });
  const catsQ = useProductCategories(tenantId);
  const { defaultLocation } = useDefaultLocation(tenantId);
  const stockQ = useStockOnHand(tenantId, defaultLocation?.id);

  const catName = useMemo(() => {
    const m = new Map<string, string>();
    (catsQ.data ?? []).forEach((c) => m.set(c.id, c.name));
    return m;
  }, [catsQ.data]);

  const stockByProduct = useMemo(() => {
    const m = new Map<string, number>();
    (stockQ.data ?? []).forEach((r) => m.set(r.product_id, Number(r.qty_on_hand)));
    return m;
  }, [stockQ.data]);

  const rows = (listQ.data ?? [])
    .filter((p) => (showInactive ? true : p.active))
    .filter((p) => (categoryId ? p.category_id === categoryId : true));

  return (
    <>
      <AppHeader title="Products" subtitle="Retail catalogue — food, treats, meds, accessories." />
      <div className="flex-1 p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, SKU, barcode…"
              className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm" />
          </div>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm">
            <option value="">All categories</option>
            {(catsQ.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          <div className="flex-1" />
          <button onClick={() => { setCreating(true); setEditing(null); }}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            <Plus className="h-4 w-4" /> New product
          </button>
        </div>

        <div className="sk-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3 text-right">Sell</th>
                <th className="px-5 py-3 text-right">On hand</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                  {listQ.isLoading ? "Loading…" : "No products yet."}
                </td></tr>
              )}
              {rows.map((p) => {
                const qty = stockByProduct.get(p.id) ?? 0;
                const low = p.reorder_level != null && qty <= Number(p.reorder_level);
                return (
                  <tr key={p.id} className="cursor-pointer hover:bg-sk-surface-muted/40" onClick={() => setEditing(p)}>
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{p.sku ?? "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{p.category_id ? catName.get(p.category_id) ?? "—" : "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {p.sell_price != null ? `R ${Number(p.sell_price).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <span className={low ? "font-semibold text-sk-coral-dark" : ""}>{qty}</span>
                      {low && <span className="ml-2 rounded-full bg-sk-coral-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-sk-coral-dark">Low</span>}
                    </td>
                    <td className="px-5 py-3">
                      {p.active
                        ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-800">Active</span>
                        : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">Inactive</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && tenantId && (
        <ProductFormModal
          tenantId={tenantId}
          product={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </>
  );
}