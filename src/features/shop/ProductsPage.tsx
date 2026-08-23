import { useMemo, useState } from "react";
import { Camera, ImageIcon, Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import {
  useCategoryTree, useDefaultLocation, useProductBrands, useProducts, useStockOnHand, type Product,
} from "./queries";
import { useProductImageUrls } from "./productImages";
import ProductFormModal from "./ProductFormModal";

const PAGE = 100;

export default function ProductsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;

  const [search, setSearch] = useState("");
  const [parentId, setParentId] = useState("");
  const [subId, setSubId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [species, setSpecies] = useState("");
  const [onlyMissingPhotos, setOnlyMissingPhotos] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const listQ = useProducts(tenantId, { search });
  const tree = useCategoryTree(tenantId);
  const brandsQ = useProductBrands(tenantId);
  const { defaultLocation } = useDefaultLocation(tenantId);
  const stockQ = useStockOnHand(tenantId, defaultLocation?.id);

  const brandName = useMemo(() => {
    const m = new Map<string, string>();
    (brandsQ.data ?? []).forEach((b) => m.set(b.id, b.name));
    return m;
  }, [brandsQ.data]);

  const stockByProduct = useMemo(() => {
    const m = new Map<string, number>();
    (stockQ.data ?? []).forEach((r) => m.set(r.product_id, Number(r.qty_on_hand)));
    return m;
  }, [stockQ.data]);

  const subcats = parentId ? tree.childrenOf(parentId) : [];
  const catFilterIds = subId ? [subId] : parentId ? tree.familyIds(parentId) : null;

  const rows = (listQ.data ?? [])
    .filter((p) => (showInactive ? true : p.active))
    .filter((p) => (catFilterIds ? p.category_id && catFilterIds.includes(p.category_id) : true))
    .filter((p) => (brandId ? p.brand_id === brandId : true))
    .filter((p) => (species ? p.species === species : true))
    .filter((p) => (onlyMissingPhotos ? !p.image_url : true));

  const page = rows.slice(0, visible);
  const resolve = useProductImageUrls(page.map((p) => p.image_url));

  const speciesOptions = useMemo(
    () => Array.from(new Set((listQ.data ?? []).map((p) => p.species).filter(Boolean) as string[])).sort(),
    [listQ.data],
  );

  return (
    <>
      <AppHeader title="Products" subtitle="Retail catalogue — food, treats, meds, accessories." />
      <div className="flex-1 p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setVisible(PAGE); }}
              placeholder="Search name, SKU, barcode, Xero code…"
              className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm" />
          </div>
          <select value={parentId} onChange={(e) => { setParentId(e.target.value); setSubId(""); setVisible(PAGE); }}
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm">
            <option value="">All categories</option>
            {tree.parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={subId} onChange={(e) => { setSubId(e.target.value); setVisible(PAGE); }}
            disabled={subcats.length === 0}
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm disabled:opacity-50">
            <option value="">{subcats.length ? "All subcategories" : "No subcategories"}</option>
            {subcats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setVisible(PAGE); }}
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm">
            <option value="">All brands</option>
            {(brandsQ.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={species} onChange={(e) => { setSpecies(e.target.value); setVisible(PAGE); }}
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm">
            <option value="">All species</option>
            {speciesOptions.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={onlyMissingPhotos} onChange={(e) => { setOnlyMissingPhotos(e.target.checked); setVisible(PAGE); }} />
            No photo
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          <div className="flex-1" />
          <Link to="/admin/shop-stock/photos"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold">
            <Camera className="h-4 w-4" /> Photo studio
          </Link>
          <button onClick={() => { setCreating(true); setEditing(null); }}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            <Plus className="h-4 w-4" /> New product
          </button>
        </div>

        <div className="text-xs text-muted-foreground">
          {listQ.isLoading ? "Loading…" : `${rows.length} product${rows.length === 1 ? "" : "s"}`}
        </div>

        <div className="sk-card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-14 px-3 py-3"></th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3 text-right">Sell</th>
                <th className="px-4 py-3 text-right">On hand</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {page.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                  {listQ.isLoading ? "Loading…" : "No products match these filters."}
                </td></tr>
              )}
              {page.map((p) => {
                const qty = stockByProduct.get(p.id) ?? 0;
                const low = p.reorder_level != null && qty <= Number(p.reorder_level);
                const img = resolve(p.image_url);
                return (
                  <tr key={p.id} className="cursor-pointer hover:bg-sk-surface-muted/40" onClick={() => setEditing(p)}>
                    <td className="px-3 py-2">
                      <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg border border-border bg-white">
                        {img
                          ? <img src={img} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                          : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{p.name}</div>
                      {(p.size_pack || p.variant_label) && (
                        <div className="text-xs text-muted-foreground">
                          {[p.variant_label, p.size_pack].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{p.brand_id ? brandName.get(p.brand_id) ?? "—" : "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{tree.labelFor(p.category_id) || "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.external_code ?? p.sku ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {p.sell_price != null ? `R ${Number(p.sell_price).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span className={low ? "font-semibold text-sk-coral-dark" : ""}>{qty}</span>
                      {low && <span className="ml-2 rounded-full bg-sk-coral-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-sk-coral-dark">Low</span>}
                    </td>
                    <td className="px-4 py-2">
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

        {rows.length > page.length && (
          <div className="flex justify-center">
            <button onClick={() => setVisible((v) => v + PAGE)}
              className="h-10 rounded-lg border border-border bg-white px-4 text-sm font-semibold">
              Show more ({rows.length - page.length} left)
            </button>
          </div>
        )}
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
