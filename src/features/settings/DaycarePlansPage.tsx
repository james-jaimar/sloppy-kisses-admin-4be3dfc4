import { useMemo, useState } from "react";
import { Plus, Save, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import {
  useCreateDaycarePlan, useDaycarePlans, useUpdateDaycarePlan, useDeleteDaycarePlan, type DaycarePlan,
} from "@/features/daycare/queries";
import { useConfirm } from "@/components/ui/confirm-dialog";

const PERMISSION = "settings.daycare.manage";

type Draft = Partial<DaycarePlan>;

function emptyRow(): Draft {
  return { name: "", days_per_week: 3, price: 0, billing_period: "month", sort_order: 100, active: true };
}

export default function DaycarePlansPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const confirm = useConfirm();
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);

  const listQ = useDaycarePlans(tenantId);
  const create = useCreateDaycarePlan(tenantId ?? "");
  const update = useUpdateDaycarePlan(tenantId ?? "");
  const del = useDeleteDaycarePlan(tenantId ?? "");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [creating, setCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const rows = useMemo(
    () => (listQ.data ?? []).filter((r) => showInactive || r.active),
    [listQ.data, showInactive],
  );

  function beginEdit(r: DaycarePlan) { setEditingId(r.id); setDraft({ ...r }); setCreating(false); }

  async function saveEdit() {
    if (!editingId) return;
    try {
      await update.mutateAsync({
        id: editingId,
        patch: {
          name: draft.name,
          days_per_week: draft.days_per_week != null ? Number(draft.days_per_week) : null,
          price: draft.price != null ? Number(draft.price) : null,
          billing_period: draft.billing_period ?? "month",
          sort_order: Number(draft.sort_order ?? 100),
          active: draft.active ?? true,
        },
      });
      toast.success("Plan updated");
      setEditingId(null);
    } catch (err: any) { toast.error(err?.message ?? "Failed to update"); }
  }

  async function saveNew() {
    if (!draft.name) { toast.error("Name is required"); return; }
    try {
      await create.mutateAsync(draft);
      toast.success("Plan created");
      setCreating(false); setDraft({});
    } catch (err: any) { toast.error(err?.message ?? "Failed to create"); }
  }

  async function onDelete(r: DaycarePlan) {
    if (!window.confirm(`Delete plan "${r.name}"? Enrolments using it will keep referencing the deleted plan id.`)) return;
    try { await del.mutateAsync(r.id); toast.success("Plan deleted"); }
    catch (err: any) { toast.error(err?.message ?? "Failed to delete (plan may be in use)"); }
  }

  return (
    <>
      <AppHeader title="Daycare plans" subtitle="Weekly/monthly daycare packages." />
      <div className="flex-1 p-6 space-y-4">
        {!canManage && (
          <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
            Read-only access. Only staff with the "Manage daycare settings" permission can change these values.
          </div>
        )}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          {canManage && (
            <button onClick={() => { setCreating(true); setDraft(emptyRow()); setEditingId(null); }}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark">
              <Plus className="h-4 w-4" /> New plan
            </button>
          )}
        </div>

        <div className="sk-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Days / week</th>
                  <th className="px-5 py-3">Price (ZAR)</th>
                  <th className="px-5 py-3">Billing</th>
                  <th className="px-5 py-3">Sort</th>
                  <th className="px-5 py-3">Active</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {creating && (
                  <DraftRow draft={draft} setDraft={setDraft}
                    onCancel={() => { setCreating(false); setDraft({}); }}
                    onSave={saveNew} pending={create.isPending} />
                )}
                {rows.length === 0 && !creating && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">No plans yet.</td></tr>
                )}
                {rows.map((r) => editingId === r.id ? (
                  <DraftRow key={r.id} draft={draft} setDraft={setDraft}
                    onCancel={() => setEditingId(null)} onSave={saveEdit} pending={update.isPending} />
                ) : (
                  <tr key={r.id} className="hover:bg-sk-surface-muted/40">
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3 tabular-nums">{r.days_per_week ?? "-"}</td>
                    <td className="px-5 py-3 tabular-nums">{r.price ?? "-"}</td>
                    <td className="px-5 py-3">{r.billing_period}</td>
                    <td className="px-5 py-3 tabular-nums">{r.sort_order}</td>
                    <td className="px-5 py-3">{r.active ? "Yes" : "No"}</td>
                    <td className="px-5 py-3 text-right">
                      {canManage && (
                        <div className="inline-flex gap-2">
                          <button onClick={() => beginEdit(r)}
                            className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-sk-surface-muted">Edit</button>
                          <button onClick={() => onDelete(r)} disabled={del.isPending}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1 text-xs text-sk-coral-dark hover:bg-sk-coral-soft disabled:opacity-50">
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function DraftRow({ draft, setDraft, onCancel, onSave, pending }: {
  draft: Draft; setDraft: (d: Draft) => void;
  onCancel: () => void; onSave: () => void; pending: boolean;
}) {
  return (
    <tr className="bg-sk-surface-muted/60">
      <td className="px-5 py-3">
        <input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="h-9 w-full rounded border border-border bg-white px-2 text-sm" />
      </td>
      <td className="px-5 py-3">
        <input type="number" min={0} max={7} value={draft.days_per_week ?? ""}
          onChange={(e) => setDraft({ ...draft, days_per_week: e.target.value === "" ? null : Number(e.target.value) })}
          className="h-9 w-20 rounded border border-border bg-white px-2 text-sm" />
      </td>
      <td className="px-5 py-3">
        <input type="number" min={0} step="0.01" value={draft.price ?? ""}
          onChange={(e) => setDraft({ ...draft, price: e.target.value === "" ? null : Number(e.target.value) })}
          className="h-9 w-28 rounded border border-border bg-white px-2 text-sm" />
      </td>
      <td className="px-5 py-3">
        <select value={draft.billing_period ?? "month"} onChange={(e) => setDraft({ ...draft, billing_period: e.target.value })}
          className="h-9 rounded border border-border bg-white px-2 text-sm">
          <option value="month">month</option>
          <option value="week">week</option>
          <option value="one_off">one-off</option>
        </select>
      </td>
      <td className="px-5 py-3">
        <input type="number" value={draft.sort_order ?? 100}
          onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
          className="h-9 w-20 rounded border border-border bg-white px-2 text-sm" />
      </td>
      <td className="px-5 py-3">
        <input type="checkbox" checked={draft.active ?? true} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
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