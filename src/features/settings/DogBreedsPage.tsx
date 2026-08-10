import { useMemo, useState } from "react";
import { Plus, Save, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  BREED_SIZE_LABEL,
  useCreateDogBreed,
  useDeleteDogBreed,
  useDogBreeds,
  useUpdateDogBreed,
  type BreedSizeBand,
  type DogBreed,
} from "@/features/pets/breedQueries";

const PERMISSION = "settings.grooming.manage";

type Draft = Partial<DogBreed>;

function empty(): Draft {
  return { name: "", size_band: "medium", active: true, sort_order: 100, is_power_breed: false };
}

export default function DogBreedsPage() {
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);
  const confirm = useConfirm();

  const listQ = useDogBreeds({ activeOnly: false });
  const create = useCreateDogBreed();
  const update = useUpdateDogBreed();
  const del = useDeleteDogBreed();

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [search, setSearch] = useState("");
  const [bandFilter, setBandFilter] = useState<BreedSizeBand | "">("");
  const [showInactive, setShowInactive] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (listQ.data ?? []).filter((r) => {
      if (!showInactive && !r.active) return false;
      if (bandFilter && r.size_band !== bandFilter) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [listQ.data, search, bandFilter, showInactive]);

  async function saveNew() {
    if (!draft.name?.trim()) { toast.error("Name is required"); return; }
    try {
      await create.mutateAsync({
        name: draft.name.trim(),
        size_band: (draft.size_band ?? "medium") as BreedSizeBand,
        active: draft.active ?? true,
        sort_order: Number(draft.sort_order ?? 100),
        is_power_breed: draft.is_power_breed ?? false,
      });
      toast.success("Breed added");
      setCreating(false); setDraft({});
    } catch (err: any) { toast.error(err?.message ?? "Failed to add"); }
  }

  async function saveEdit() {
    if (!editingId) return;
    try {
      await update.mutateAsync({
        id: editingId,
        patch: {
          name: draft.name?.trim(),
          size_band: draft.size_band as BreedSizeBand,
          active: draft.active,
          sort_order: Number(draft.sort_order ?? 100),
          is_power_breed: draft.is_power_breed ?? false,
        },
      });
      toast.success("Breed updated");
      setEditingId(null); setDraft({});
    } catch (err: any) { toast.error(err?.message ?? "Failed to update"); }
  }

  return (
    <>
      <AppHeader
        title="Dog breeds"
        subtitle="Master list of dog breeds, their size band and whether they count as a power breed. Used to auto-set a pet's size and flag power breeds at booking."
        actions={canManage ? (
          <button
            onClick={() => { setCreating(true); setEditingId(null); setDraft(empty()); }}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark"
          >
            <Plus className="h-4 w-4" /> New breed
          </button>
        ) : null}
      />
      <div className="flex-1 space-y-4 p-6">
        {!canManage && (
          <div className="sk-card p-4 text-sm text-muted-foreground">
            Read-only view. Ask an admin with the <code>settings.grooming.manage</code> permission to make changes.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search breed…"
            className="h-9 w-56 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
          <select
            value={bandFilter} onChange={(e) => setBandFilter(e.target.value as any)}
            className="h-9 rounded-lg border border-border bg-white px-2 text-sm"
          >
            <option value="">All sizes</option>
            {Object.entries(BREED_SIZE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4" />
            Show inactive
          </label>
          <div className="ml-auto text-xs text-muted-foreground">{rows.length} breed{rows.length === 1 ? "" : "s"}</div>
        </div>

        <div className="sk-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Breed</th>
                <th className="px-4 py-3">Size band</th>
                <th className="px-4 py-3">Power breed</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {creating && (
                <tr className="bg-sk-coral-soft/40">
                  <td className="px-4 py-2">
                    <input autoFocus placeholder="Breed name" value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8 w-full rounded border border-border bg-white px-2 text-sm" />
                  </td>
                  <td className="px-4 py-2">
                    <select value={draft.size_band ?? "medium"} onChange={(e) => setDraft({ ...draft, size_band: e.target.value as BreedSizeBand })} className="h-8 rounded border border-border bg-white px-2 text-sm">
                      {Object.entries(BREED_SIZE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={draft.is_power_breed ?? false} onChange={(e) => setDraft({ ...draft, is_power_breed: e.target.checked })} className="h-4 w-4" />
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
              {listQ.isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!listQ.isLoading && rows.length === 0 && !creating && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No breeds found.</td></tr>
              )}
              {rows.map((r) => {
                const isEditing = editingId === r.id;
                return (
                  <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                    <td className="px-4 py-3 font-medium">
                      {isEditing ? (
                        <input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8 w-full rounded border border-border bg-white px-2 text-sm" />
                      ) : r.name}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select value={draft.size_band ?? r.size_band} onChange={(e) => setDraft({ ...draft, size_band: e.target.value as BreedSizeBand })} className="h-8 rounded border border-border bg-white px-2 text-sm">
                          {Object.entries(BREED_SIZE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      ) : BREED_SIZE_LABEL[r.size_band]}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input type="checkbox" checked={draft.is_power_breed ?? false} onChange={(e) => setDraft({ ...draft, is_power_breed: e.target.checked })} className="h-4 w-4" />
                      ) : r.is_power_breed ? (
                        <span className="inline-flex rounded-full bg-sk-orange-soft px-2 py-0.5 text-xs font-medium text-sk-orange">Power breed</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
                            <button onClick={() => { setEditingId(r.id); setDraft({ ...r }); setCreating(false); }} className="rounded-lg px-3 py-1 text-xs font-medium text-sk-coral-dark hover:bg-sk-coral-soft">Edit</button>
                            <button
                              onClick={async () => {
                                if (!(await confirm({ title: `Delete breed "${r.name}"?`, description: "This will not affect existing pets.", confirmLabel: "Delete", tone: "destructive" }))) return;
                                try { await del.mutateAsync(r.id); toast.success("Deleted"); }
                                catch (err: any) { toast.error(err?.message ?? "Failed to delete"); }
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