import { useState } from "react";
import { Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useDeletePaymentMethod, usePaymentMethods, useUpsertPaymentMethod } from "@/features/invoices/queries";
import { useConfirm } from "@/components/ui/confirm-dialog";

const PERMISSION = "settings.invoicing.manage";

type Draft = { id?: string; code: string; label: string; is_active: boolean; sort_order: number };

export default function PaymentMethodsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const confirm = useConfirm();
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);

  const listQ = usePaymentMethods(tenantId);
  const upsert = useUpsertPaymentMethod(tenantId ?? "");
  const del = useDeletePaymentMethod(tenantId ?? "");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ code: "", label: "", is_active: true, sort_order: 100 });
  const [creating, setCreating] = useState(false);

  async function save() {
    if (!draft.code.trim() || !draft.label.trim()) { toast.error("Code and label required"); return; }
    try {
      await upsert.mutateAsync(draft);
      toast.success(editingId ? "Method updated" : "Method added");
      setEditingId(null); setCreating(false);
      setDraft({ code: "", label: "", is_active: true, sort_order: 100 });
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  return (
    <>
      <AppHeader title="Payment methods" subtitle="Manual payment methods available when recording payments." />
      <div className="flex-1 p-6 space-y-4">
        {!canManage && (
          <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
            Read-only. Only staff with the "Manage invoicing settings" permission can change these values.
          </div>
        )}
        <div className="flex justify-end">
          {canManage && (
            <button onClick={() => { setCreating(true); setEditingId(null); setDraft({ code: "", label: "", is_active: true, sort_order: 100 }); }}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark">
              <Plus className="h-4 w-4" /> New method
            </button>
          )}
        </div>

        <div className="sk-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Label</th>
                <th className="px-5 py-3">Sort</th>
                <th className="px-5 py-3">Active</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {creating && (
                <Row draft={draft} setDraft={setDraft} isNew onSave={save} onCancel={() => setCreating(false)} pending={upsert.isPending} />
              )}
              {(listQ.data ?? []).length === 0 && !creating && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">No payment methods yet.</td></tr>
              )}
              {(listQ.data ?? []).map((r: any) => editingId === r.id ? (
                <Row key={r.id} draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditingId(null)} pending={upsert.isPending} />
              ) : (
                <tr key={r.id} className="hover:bg-sk-surface-muted/40">
                  <td className="px-5 py-3 font-mono text-xs">{r.code}</td>
                  <td className="px-5 py-3">{r.label}</td>
                  <td className="px-5 py-3 tabular-nums">{r.sort_order}</td>
                  <td className="px-5 py-3">{r.is_active ? "Yes" : "No"}</td>
                  <td className="px-5 py-3 text-right">
                    {canManage && (
                      <div className="inline-flex gap-2">
                        <button onClick={() => { setEditingId(r.id); setDraft({ id: r.id, code: r.code, label: r.label, is_active: r.is_active, sort_order: r.sort_order }); setCreating(false); }}
                          className="rounded-lg border border-border px-3 py-1 text-xs">Edit</button>
                        <button onClick={async () => {
                          if (!confirm("Delete method?")) return;
                          try { await del.mutateAsync(r.id); toast.success("Deleted"); }
                          catch (err: any) { toast.error(err?.message ?? "Failed"); }
                        }} className="rounded-lg border border-border px-3 py-1 text-xs text-sk-coral-dark">Delete</button>
                      </div>
                    )}
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

function Row({ draft, setDraft, onSave, onCancel, pending, isNew }: {
  draft: Draft; setDraft: (d: Draft) => void; onSave: () => void; onCancel: () => void; pending: boolean; isNew?: boolean;
}) {
  return (
    <tr className="bg-sk-surface-muted/60">
      <td className="px-5 py-3">
        <input disabled={!isNew} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          className="h-9 w-28 rounded border border-border bg-white px-2 text-sm font-mono disabled:opacity-60" />
      </td>
      <td className="px-5 py-3">
        <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          className="h-9 w-full rounded border border-border bg-white px-2 text-sm" />
      </td>
      <td className="px-5 py-3">
        <input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
          className="h-9 w-20 rounded border border-border bg-white px-2 text-sm" />
      </td>
      <td className="px-5 py-3">
        <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
      </td>
      <td className="px-5 py-3 text-right">
        <div className="inline-flex gap-2">
          <button onClick={onSave} disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg bg-sk-coral px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> Save
          </button>
          <button onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1 text-xs">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}