import { useEffect, useMemo, useRef, useState } from "react";
import { Barcode, ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCategoryTree, useProductBrands, useUpsertProduct, type Product } from "./queries";
import { deleteProductImage, forgetProductImage, uploadProductImage, useProductImageUrls } from "./productImages";

interface Props {
  tenantId: string;
  product?: Product | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

const SPECIES = ["dog", "cat", "small pet", "bird", "other"];

export default function ProductFormModal({ tenantId, product, onClose, onSaved }: Props) {
  const tree = useCategoryTree(tenantId);
  const brands = useProductBrands(tenantId);
  const upsert = useUpsertProduct(tenantId);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    name: "", sku: "", external_code: "", barcode: "", parent_category_id: "", category_id: "",
    brand_id: "", species: "", size_pack: "", variant_label: "",
    unit: "each", cost_price: "", sell_price: "", vat_rate: "15",
    reorder_level: "", sort_order: "100", active: true, sell_in_pos: true, description: "",
    image_url: "" as string,
  });

  useEffect(() => {
    if (!product) return;
    const cat = product.category_id ? tree.byId.get(product.category_id) : null;
    setForm({
      name: product.name ?? "",
      sku: product.sku ?? "",
      external_code: product.external_code ?? "",
      barcode: product.barcode ?? "",
      parent_category_id: cat ? (cat.parent_id ?? cat.id) : "",
      category_id: cat && cat.parent_id ? cat.id : "",
      brand_id: product.brand_id ?? "",
      species: product.species ?? "",
      size_pack: product.size_pack ?? "",
      variant_label: product.variant_label ?? "",
      unit: product.unit ?? "each",
      cost_price: product.cost_price != null ? String(product.cost_price) : "",
      sell_price: product.sell_price != null ? String(product.sell_price) : "",
      vat_rate: String(product.vat_rate ?? 15),
      reorder_level: product.reorder_level != null ? String(product.reorder_level) : "",
      sort_order: String(product.sort_order ?? 100),
      active: product.active,
      sell_in_pos: product.sell_in_pos ?? true,
      description: product.description ?? "",
      image_url: product.image_url ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, tree.all.length]);

  const subcats = useMemo(
    () => (form.parent_category_id ? tree.childrenOf(form.parent_category_id).filter((c) => c.active) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.parent_category_id, tree.all.length],
  );

  const resolve = useProductImageUrls([form.image_url]);
  const preview = resolve(form.image_url);

  async function pickImage(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (!product?.id) { toast.error("Save the product first, then add a photo"); return; }
    setUploading(true);
    try {
      const path = await uploadProductImage(tenantId, product.id, file);
      if (form.image_url && form.image_url !== path) await deleteProductImage(form.image_url);
      forgetProductImage(form.image_url);
      setForm((f) => ({ ...f, image_url: path }));
      toast.success("Photo uploaded — remember to save");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    try {
      const id = await upsert.mutateAsync({
        id: product?.id,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        external_code: form.external_code.trim() || null,
        barcode: form.barcode.trim() || null,
        category_id: form.category_id || form.parent_category_id || null,
        brand_id: form.brand_id || null,
        species: form.species || null,
        size_pack: form.size_pack.trim() || null,
        variant_label: form.variant_label.trim() || null,
        parent_product_id: product?.parent_product_id ?? null,
        sell_in_pos: form.sell_in_pos,
        unit: form.unit || null,
        cost_price: form.cost_price === "" ? null : Number(form.cost_price),
        sell_price: form.sell_price === "" ? null : Number(form.sell_price),
        vat_rate: Number(form.vat_rate || 0),
        reorder_level: form.reorder_level === "" ? null : Number(form.reorder_level),
        sort_order: Number(form.sort_order || 100),
        active: form.active,
        description: form.description.trim() || null,
        image_url: form.image_url || null,
      });
      toast.success(product ? "Product updated" : "Product created");
      onSaved?.(id);
      onClose();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  return (
    <ModalShell
      title={product ? "Edit product" : "New product"}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm">Cancel</button>
          <button onClick={save} disabled={upsert.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white disabled:opacity-50">
            <Save className="h-4 w-4" /> Save
          </button>
        </div>
      }
    >
      <div className="grid gap-4 p-6 sm:grid-cols-2">
        {/* Photo */}
        <div className="sm:col-span-2 flex items-center gap-4 rounded-xl border border-border bg-sk-surface-muted/40 p-3">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-white">
            {preview
              ? <img src={preview} alt={form.name || "Product photo"} className="h-full w-full object-cover" />
              : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Product photo</div>
            <p className="text-xs text-muted-foreground">
              {product?.id ? "Shown on the till grid. Square photos look best." : "Save the product first, then add a photo."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={!product?.id || uploading} onClick={() => fileRef.current?.click()}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-semibold disabled:opacity-50">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                {form.image_url ? "Replace photo" : "Add photo"}
              </button>
              {form.image_url && (
                <button type="button" onClick={async () => { await deleteProductImage(form.image_url); setForm({ ...form, image_url: "" }); }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-sk-coral-dark">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickImage(f); e.target.value = ""; }} />
          </div>
        </div>

        <Field label="Name" className="sm:col-span-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
        </Field>

        <Field label="Brand">
          <select value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
            <option value="">No brand</option>
            {(brands.data ?? []).filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Species">
          <select value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
            <option value="">Any</option>
            {SPECIES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </Field>

        <Field label="Category">
          <select value={form.parent_category_id}
            onChange={(e) => setForm({ ...form, parent_category_id: e.target.value, category_id: "" })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
            <option value="">Uncategorised</option>
            {tree.parents.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Subcategory">
          <select value={form.category_id} disabled={subcats.length === 0}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm disabled:opacity-50">
            <option value="">{subcats.length ? "None" : "No subcategories"}</option>
            {subcats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        <Field label="Xero item code" hint="Keeps the catalogue in step with Xero">
          <input value={form.external_code} onChange={(e) => setForm({ ...form, external_code: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-mono" />
        </Field>
        <Field label="SKU">
          <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-mono" />
        </Field>

        <Field label="Barcode" hint="Click Scan, then fire the scanner at the item" className="sm:col-span-2">
          <div className="flex gap-2">
            <input ref={barcodeRef} value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              placeholder="Scan or type"
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-mono" />
            <button type="button" onClick={() => { setForm({ ...form, barcode: "" }); barcodeRef.current?.focus(); }}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold">
              <Barcode className="h-4 w-4" /> Scan
            </button>
          </div>
        </Field>

        <Field label="Pack size" hint="e.g. 2kg, 400g, 12-pack">
          <input value={form.size_pack} onChange={(e) => setForm({ ...form, size_pack: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
        </Field>
        <Field label="Variant" hint="e.g. Chicken, Large, Blue">
          <input value={form.variant_label} onChange={(e) => setForm({ ...form, variant_label: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
        </Field>

        <Field label="Unit" hint="each, kg, bag, box…">
          <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
        </Field>
        <Field label="Cost price (ZAR)">
          <input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
        </Field>
        <Field label="Sell price (ZAR, VAT incl.)">
          <input type="number" step="0.01" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
        </Field>
        <Field label="VAT rate (%)">
          <input type="number" step="0.01" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
        </Field>
        <Field label="Reorder level" hint="Show low-stock chip when qty ≤ this">
          <input type="number" step="0.01" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
        </Field>
        <Field label="Sort order">
          <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.sell_in_pos} onChange={(e) => setForm({ ...form, sell_in_pos: e.target.checked })} />
          Show on the till
        </label>
      </div>
    </ModalShell>
  );
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={"block " + (className ?? "")}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </label>
  );
}
