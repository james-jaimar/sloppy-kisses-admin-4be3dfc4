import { useState } from "react";
import { Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useDeleteProductBrand, useProductBrands, useUpsertProductBrand } from "@/features/shop/queries";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Draft = { id?: string; name: string; sort_order: number; active: boolean };
const EMPTY: Draft = { name: "", sort_order: 100, active: true };

export default function ProductBrandsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const confirm = useConfirm();
  const listQ = useProductBrands(tenantId);
  const upsert = useUpsertProductBrand(tenantId ?? "");
  const del = useDeleteProductBrand(tenantId ?? "");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  async function save() {
    if (!draft.name.trim()) { toast.error("Name required"); return; }
    try {
      await upsert.mutateAsync(draft);
      toast.success(editingId ? "Brand updated" : "Brand added");
      setEditingId(null); setCreating(false); setDraft(EMPTY);
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  return (
    <>
      <AppHeader title="Product brands" subtitle="Brands used to filter the catalogue and the till." />
      <div className="flex-1 p-4 sm:p-6 space-y-4">
        <div className="flex justify-end">
          <button onClick={() => { setCreating(true); setEditingId(null); setDraft(EMPTY); }}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            <Plus className="h-4 w-4" /> New brand
          </button>
        </div>
        <div className="sk-card overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Sort</th>
                <th className="px-5 py-3">Active</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {creating && <Row draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setCreating(false)} pending={upsert.isPending} />}
              {(listQ.data ?? []).length === 0 && !creating && (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">No brands yet.</td></tr>
              )}
              {(listQ.data ?? []).map((r) => editingId === r.id ? (
                <Row key={r.id} draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditingId(null)} pending={upsert.isPending} />
              ) : (
                <tr key={r.id} className="hover:bg-sk-surface-muted/40">
                  <td className="px-5 py-3 font-medium">{r.name}</td>
                  <td className="px-5 py-3 tabular-nums">{r.sort_order}</td>
                  <td className="px-5 py-3">{r.active ? "Yes" : "No"}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button onClick={() => { setEditingId(r.id); setCreating(false); setDraft({ id: r.id, name: r.name, sort_order: r.sort_order, active: r.active }); }}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs">Edit</button>
                      <button onClick={async () => {
                        if (!(await confirm({ title: "Delete brand?", body: "Products keep their details but lose the brand tag.", confirmLabel: "Delete", tone: "destructive" }))) return;
                        try { await del.mutateAsync(r.id); toast.success("Deleted"); }
                        catch (err: any) { toast.error(err?.message ?? "Failed"); }
                      }} className="rounded-lg border border-border px-3 py-1.5 text-xs text-sk-coral-dark">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Row({ draft, setDraft, onSave, onCancel, pending }: {
  draft: Draft; setDraft: (d: Draft) => void; onSave: () => void; onCancel: () => void; pending: boolean;
}) {
  return (
    <tr className="bg-sk-surface-muted/60">
      <td className="px-5 py-3">
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="h-10 w-full rounded border border-border bg-white px-2 text-sm" />
      </td>
      <td className="px-5 py-3">
        <input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
          className="h-10 w-20 rounded border border-border bg-white px-2 text-sm" />
      </td>
      <td className="px-5 py-3">
        <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
      </td>
      <td className="px-5 py-3 text-right">
        <div className="inline-flex gap-2">
          <button onClick={onSave} disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg bg-sk-coral px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> Save
          </button>
          <button onClick={onCancel} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}
