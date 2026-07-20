import { useMemo, useState } from "react";
import { Plus, Save, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import {
  SIZE_LABEL,
  SPECIES_LABEL,
  useCreateGroomingPackage,
  useGroomingPackages,
  useUpdateGroomingPackage,
  useDeleteGroomingPackage,
  type GroomingPackage,
  type GroomingPackageType,
  type GroomingSizeBand,
  type GroomingSpecies,
} from "./groomingRateCardQueries";
import { useConfirm } from "@/components/ui/confirm-dialog";

const PERMISSION = "settings.grooming.manage";

type Draft = Partial<GroomingPackage> & { active?: boolean };

function emptyRow(): Draft {
  return { code: "", name: "", species: "dog", size_band: "medium", package_type: "full", price_zar: 0, expected_minutes: 60, active: true, sort_order: 100 };
}

export default function GroomingPackagesPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const confirm = useConfirm();
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);
  const del = useDeleteGroomingPackage(tenantId ?? "");

  const listQ = useGroomingPackages(tenantId);
  const update = useUpdateGroomingPackage(tenantId ?? "");
  const create = useCreateGroomingPackage(tenantId ?? "");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [creating, setCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const rows = useMemo(
    () => (listQ.data ?? []).filter((r) => showInactive || r.active),
    [listQ.data, showInactive],
  );

  function beginEdit(r: GroomingPackage) {
    setEditingId(r.id);
    setDraft({ ...r });
    setCreating(false);
  }

  async function saveEdit() {
    if (!editingId) return;
    try {
      await update.mutateAsync({
        id: editingId,
        patch: {
          name: draft.name,
          price_zar: Number(draft.price_zar ?? 0),
          expected_minutes: Number(draft.expected_minutes ?? 60),
          active: draft.active,
          sort_order: Number(draft.sort_order ?? 100),
        },
      });
      toast.success("Package updated");
      setEditingId(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update");
    }
  }

  async function saveNew() {
    if (!draft.code || !draft.name) { toast.error("Code and name are required"); return; }
    try {
      await create.mutateAsync({
        code: draft.code!,
        name: draft.name!,
        species: (draft.species ?? "dog") as GroomingSpecies,
        size_band: (draft.size_band ?? null) as GroomingSizeBand | null,
        package_type: (draft.package_type ?? "full") as GroomingPackageType,
        price_zar: Number(draft.price_zar ?? 0),
        expected_minutes: Number(draft.expected_minutes ?? 60),
        active: draft.active ?? true,
        sort_order: Number(draft.sort_order ?? 100),
      });
      toast.success("Package created");
      setCreating(false); setDraft({});
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create");
    }
  }

  return (
    <>
      <AppHeader
        title="Grooming rate card"
        subtitle="Packages by species and size. Only admins with the grooming settings permission can edit."
        actions={
          canManage ? (
            <button
              onClick={() => { setCreating(true); setEditingId(null); setDraft(emptyRow()); }}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark"
            >
              <Plus className="h-4 w-4" /> New package
            </button>
          ) : null
        }
      />
      <div className="flex-1 space-y-4 p-6">
        {!canManage && (
          <div className="sk-card p-4 text-sm text-muted-foreground">
            Read-only view. Ask an admin with the <code>settings.grooming.manage</code> permission to make changes.
          </div>
        )}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4" />
            Show inactive
          </label>
        </div>

        <div className="sk-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Species</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Price (ZAR)</th>
                <th className="px-4 py-3 text-right">Duration (min)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {creating && (
                <tr className="bg-sk-coral-soft/40">
                  <td className="px-4 py-2">
                    <select value={draft.species ?? "dog"} onChange={(e) => setDraft({ ...draft, species: e.target.value as GroomingSpecies })} className="h-8 rounded border border-border bg-white px-2 text-sm">
                      <option value="dog">Dog</option><option value="cat">Cat</option><option value="rabbit">Rabbit</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select value={draft.size_band ?? ""} onChange={(e) => setDraft({ ...draft, size_band: (e.target.value || null) as GroomingSizeBand | null })} className="h-8 rounded border border-border bg-white px-2 text-sm">
                      <option value="">—</option>
                      {Object.entries(SIZE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select value={draft.package_type ?? "full"} onChange={(e) => setDraft({ ...draft, package_type: e.target.value as GroomingPackageType })} className="h-8 rounded border border-border bg-white px-2 text-sm">
                      <option value="full">Full</option><option value="express">Express</option><option value="standard">Standard</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input placeholder="Code" value={draft.code ?? ""} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="mb-1 h-7 w-full rounded border border-border bg-white px-2 text-xs" />
                    <input placeholder="Name" value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8 w-full rounded border border-border bg-white px-2 text-sm" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input type="number" value={draft.price_zar ?? 0} onChange={(e) => setDraft({ ...draft, price_zar: Number(e.target.value) })} className="h-8 w-24 rounded border border-border bg-white px-2 text-right text-sm" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input type="number" value={draft.expected_minutes ?? 60} onChange={(e) => setDraft({ ...draft, expected_minutes: Number(e.target.value) })} className="h-8 w-20 rounded border border-border bg-white px-2 text-right text-sm" />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">New</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <button onClick={saveNew} className="grid h-8 w-8 place-items-center rounded text-sk-green hover:bg-sk-green-soft"><Save className="h-4 w-4" /></button>
                      <button onClick={() => { setCreating(false); setDraft({}); }} className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              )}
              {listQ.isLoading && <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!listQ.isLoading && rows.length === 0 && !creating && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No packages yet.</td></tr>
              )}
              {rows.map((r) => {
                const isEditing = editingId === r.id;
                return (
                  <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                    <td className="px-4 py-3">{SPECIES_LABEL[r.species]}</td>
                    <td className="px-4 py-3">{r.size_band ? SIZE_LABEL[r.size_band] : "—"}</td>
                    <td className="px-4 py-3 capitalize">{r.package_type}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8 w-full rounded border border-border bg-white px-2 text-sm" />
                      ) : (
                        <>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.code}</div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {isEditing ? (
                        <input type="number" value={draft.price_zar ?? 0} onChange={(e) => setDraft({ ...draft, price_zar: Number(e.target.value) })} className="h-8 w-24 rounded border border-border bg-white px-2 text-right text-sm" />
                      ) : `R ${r.price_zar}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {isEditing ? (
                        <input type="number" value={draft.expected_minutes ?? 60} onChange={(e) => setDraft({ ...draft, expected_minutes: Number(e.target.value) })} className="h-8 w-20 rounded border border-border bg-white px-2 text-right text-sm" />
                      ) : r.expected_minutes}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={draft.active ?? true} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="h-4 w-4" />
                          Active
                        </label>
                      ) : (
                        <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (r.active ? "bg-sk-green-soft text-sk-green" : "bg-muted text-muted-foreground")}>
                          {r.active ? "Active" : "Inactive"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={saveEdit} className="grid h-8 w-8 place-items-center rounded text-sk-green hover:bg-sk-green-soft"><Save className="h-4 w-4" /></button>
                            <button onClick={() => { setEditingId(null); setDraft({}); }} className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                          </>
                        ) : canManage ? (
                          <>
                            <button onClick={() => beginEdit(r)} className="rounded-lg px-3 py-1 text-xs font-medium text-sk-coral-dark hover:bg-sk-coral-soft">Edit</button>
                            <button
                              onClick={async () => {
                                if (!window.confirm(`Delete package "${r.name}"?`)) return;
                                try { await del.mutateAsync(r.id); toast.success("Deleted"); }
                                catch (err: any) { toast.error(err?.message ?? "Failed to delete (in use?)"); }
                              }}
                              disabled={del.isPending}
                              className="grid h-8 w-8 place-items-center rounded text-sk-coral-dark hover:bg-sk-coral-soft disabled:opacity-50"
                            ><Trash2 className="h-4 w-4" /></button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}