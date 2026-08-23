import { useState } from "react";
import { Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useCategoryTree, useDeleteProductCategory, useUpsertProductCategory } from "@/features/shop/queries";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Draft = { id?: string; name: string; parent_id: string | null; sort_order: number; active: boolean };

export default function ProductCategoriesPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const confirm = useConfirm();
  const tree = useCategoryTree(tenantId);
  const upsert = useUpsertProductCategory(tenantId ?? "");
  const del = useDeleteProductCategory(tenantId ?? "");

  const orderedCats = tree.parents.flatMap((p) => [p, ...tree.childrenOf(p.id)]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>({ name: "", parent_id: null, sort_order: 100, active: true });

  async function save() {
    if (!draft.name.trim()) { toast.error("Name required"); return; }
    try {
      await upsert.mutateAsync(draft);
      toast.success(editingId ? "Category updated" : "Category added");
      setEditingId(null); setCreating(false);
      setDraft({ name: "", parent_id: null, sort_order: 100, active: true });
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  return (
    <>
      <AppHeader title="Product categories" subtitle="Group products for filtering and reports." />
      <div className="flex-1 p-6 space-y-4">
        <div className="flex justify-end">
          <button onClick={() => { setCreating(true); setEditingId(null); setDraft({ name: "", parent_id: null, sort_order: 100, active: true }); }}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            <Plus className="h-4 w-4" /> New category
          </button>
        </div>
        <div className="sk-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Parent category</th>
                <th className="px-5 py-3">Sort</th>
                <th className="px-5 py-3">Active</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {creating && <Row draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setCreating(false)} pending={upsert.isPending} parents={tree.parents} />}
              {orderedCats.length === 0 && !creating && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">No categories yet.</td></tr>
              )}
              {orderedCats.map((r) => editingId === r.id ? (
                <Row key={r.id} draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditingId(null)} pending={upsert.isPending} parents={tree.parents} />
              ) : (
                <tr key={r.id} className="hover:bg-sk-surface-muted/40">
                  <td className="px-5 py-3 font-medium">{r.parent_id ? <span className="pl-4 text-muted-foreground">↳ </span> : null}{r.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r.parent_id ? tree.byId.get(r.parent_id)?.name ?? "—" : "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{r.sort_order}</td>
                  <td className="px-5 py-3">{r.active ? "Yes" : "No"}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button onClick={() => { setEditingId(r.id); setCreating(false); setDraft({ id: r.id, name: r.name, parent_id: r.parent_id, sort_order: r.sort_order, active: r.active }); }}
                        className="rounded-lg border border-border px-3 py-1 text-xs">Edit</button>
                      <button onClick={async () => {
                        if (!(await confirm({ title: "Delete category?", confirmLabel: "Delete", tone: "destructive" }))) return;
                        try { await del.mutateAsync(r.id); toast.success("Deleted"); }
                        catch (err: any) { toast.error(err?.message ?? "Failed"); }
                      }} className="rounded-lg border border-border px-3 py-1 text-xs text-sk-coral-dark">Delete</button>
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

function Row({ draft, setDraft, onSave, onCancel, pending, parents }: {
  draft: Draft; setDraft: (d: Draft) => void; onSave: () => void; onCancel: () => void; pending: boolean;
  parents: { id: string; name: string }[];
}) {
  return (
    <tr className="bg-sk-surface-muted/60">
      <td className="px-5 py-3">
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="h-9 w-full rounded border border-border bg-white px-2 text-sm" />
      </td>
      <td className="px-5 py-3">
        <select value={draft.parent_id ?? ""} onChange={(e) => setDraft({ ...draft, parent_id: e.target.value || null })}
          className="h-9 w-full rounded border border-border bg-white px-2 text-sm">
          <option value="">Top level</option>
          {parents.filter((p) => p.id !== draft.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
      <td className="px-5 py-3">
        <input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
          className="h-9 w-20 rounded border border-border bg-white px-2 text-sm" />
      </td>
      <td className="px-5 py-3">
        <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
      </td>
      <td className="px-5 py-3 text-right">
        <div className="inline-flex gap-2">
          <button onClick={onSave} disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg bg-sk-coral px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> Save
          </button>
          <button onClick={onCancel} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1 text-xs">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}