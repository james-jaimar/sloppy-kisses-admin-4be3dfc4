import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "@/components/modals/ModalShell";
import { useProductCategories, useUpsertProduct, type Product } from "./queries";

interface Props {
  tenantId: string;
  product?: Product | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

export default function ProductFormModal({ tenantId, product, onClose, onSaved }: Props) {
  const cats = useProductCategories(tenantId);
  const upsert = useUpsertProduct(tenantId);

  const [form, setForm] = useState({
    name: "", sku: "", barcode: "", category_id: "",
    unit: "each", cost_price: "", sell_price: "", vat_rate: "15",
    reorder_level: "", sort_order: "100", active: true, description: "",
  });

  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name ?? "",
      sku: product.sku ?? "",
      barcode: product.barcode ?? "",
      category_id: product.category_id ?? "",
      unit: product.unit ?? "each",
      cost_price: product.cost_price != null ? String(product.cost_price) : "",
      sell_price: product.sell_price != null ? String(product.sell_price) : "",
      vat_rate: String(product.vat_rate ?? 15),
      reorder_level: product.reorder_level != null ? String(product.reorder_level) : "",
      sort_order: String(product.sort_order ?? 100),
      active: product.active,
      description: product.description ?? "",
    });
  }, [product]);

  async function save() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    try {
      const id = await upsert.mutateAsync({
        id: product?.id,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        category_id: form.category_id || null,
        unit: form.unit || null,
        cost_price: form.cost_price === "" ? null : Number(form.cost_price),
        sell_price: form.sell_price === "" ? null : Number(form.sell_price),
        vat_rate: Number(form.vat_rate || 0),
        reorder_level: form.reorder_level === "" ? null : Number(form.reorder_level),
        sort_order: Number(form.sort_order || 100),
        active: form.active,
        description: form.description.trim() || null,
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
          <button onClick={onClose} className="h-9 rounded-lg border border-border px-3 text-sm">Cancel</button>
          <button onClick={save} disabled={upsert.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white disabled:opacity-50">
            <Save className="h-4 w-4" /> Save
          </button>
        </div>
      }
    >
      <div className="grid gap-4 p-6 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
        </Field>
        <Field label="SKU">
          <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-mono" />
        </Field>
        <Field label="Barcode">
          <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-mono" />
        </Field>
        <Field label="Category">
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
            <option value="">Uncategorised</option>
            {(cats.data ?? []).filter((c) => c.active).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Unit" hint="each, kg, bag, box…">
          <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
        </Field>
        <Field label="Cost price (ZAR)">
          <input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
        </Field>
        <Field label="Sell price (ZAR)">
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
        <label className="sm:col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Active
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