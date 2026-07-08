import { useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2, Syringe, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { usePetVaccinations, useUpsertPetVaccination, useDeletePetVaccination, type PetVaccination } from "@/features/comms/queries";

interface Props { tenantId: string; petId: string; }

function vaxStatus(v: PetVaccination): { label: string; tone: "green" | "orange" | "coral" } {
  if (!v.expiry_date) return { label: "No expiry", tone: "orange" };
  const today = new Date().toISOString().slice(0, 10);
  if (v.expiry_date < today) return { label: "Expired", tone: "coral" };
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  if (v.expiry_date < in30.toISOString().slice(0, 10)) return { label: "Expiring soon", tone: "orange" };
  return { label: "Valid", tone: "green" };
}

export function PetVaccinationsPanel({ tenantId, petId }: Props) {
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission("pets.manage_vaccinations");
  const q = usePetVaccinations(tenantId, petId);
  const upsert = useUpsertPetVaccination(tenantId, petId);
  const del = useDeletePetVaccination(tenantId);
  const [editing, setEditing] = useState<Partial<PetVaccination> | null>(null);

  async function save() {
    if (!editing?.vaccination_type) return toast.error("Vaccine required");
    try {
      await upsert.mutateAsync({
        id: editing.id,
        vaccination_type: editing.vaccination_type,
        product_name: editing.product_name ?? null,
        administered_date: editing.administered_date ?? null,
        expiry_date: editing.expiry_date ?? null,
        notes: editing.notes ?? null,
      } as any);
      toast.success("Saved");
      setEditing(null);
    } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div className="sk-card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><Syringe className="h-4 w-4" /> Vaccinations</h3>
        {canManage && (
          <button onClick={() => setEditing({})}
            className="inline-flex items-center gap-1 rounded-lg bg-sk-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-sk-coral-dark">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>
      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!q.isLoading && !q.data?.length && <div className="text-sm text-muted-foreground">No vaccinations on file.</div>}
      {!!q.data?.length && (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr><th className="px-2 py-1 text-left">Vaccine</th><th className="px-2 py-1 text-left">Administered</th><th className="px-2 py-1 text-left">Expires</th><th className="px-2 py-1 text-left">Status</th><th /></tr>
          </thead>
          <tbody>
            {q.data.map((v) => {
              const s = vaxStatus(v);
              const toneClass = s.tone === "green" ? "bg-sk-turquoise-soft text-sk-turquoise-dark"
                : s.tone === "orange" ? "bg-sk-orange-soft text-sk-orange"
                : "bg-sk-coral-soft text-sk-coral-dark";
              return (
                <tr key={v.id} className="border-t border-border">
                  <td className="px-2 py-1 font-medium">{v.vaccination_type}{v.product_name ? <span className="text-xs text-muted-foreground"> · {v.product_name}</span> : null}</td>
                  <td className="px-2 py-1">{v.administered_date ?? "—"}</td>
                  <td className="px-2 py-1">{v.expiry_date ?? "—"}</td>
                  <td className="px-2 py-1"><span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium " + toneClass}>{s.tone === "green" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{s.label}</span></td>
                  <td className="px-2 py-1 text-right">
                    {canManage && (
                      <>
                        <button onClick={() => setEditing(v)} className="rounded px-2 py-0.5 text-xs hover:bg-muted">Edit</button>
                        <button onClick={() => { if (confirm("Delete?")) del.mutate(v.id); }} className="rounded px-2 py-0.5 text-xs text-sk-coral-dark hover:bg-sk-coral-soft"><Trash2 className="inline h-3 w-3" /></button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editing && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-base font-semibold">{editing.id ? "Edit vaccination" : "Add vaccination"}</div>
            <div className="space-y-3 text-sm">
              <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Vaccine type</div>
                <input value={editing.vaccination_type ?? ""} onChange={(e) => setEditing({ ...editing, vaccination_type: e.target.value })} placeholder="rabies, 5-in-1, kennel_cough…" className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </label>
              <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Product name</div>
                <input value={editing.product_name ?? ""} onChange={(e) => setEditing({ ...editing, product_name: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Administered</div>
                  <input type="date" value={editing.administered_date ?? ""} onChange={(e) => setEditing({ ...editing, administered_date: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                </label>
                <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Expires</div>
                  <input type="date" value={editing.expiry_date ?? ""} onChange={(e) => setEditing({ ...editing, expiry_date: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                </label>
              </div>
              <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</div>
                <textarea rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-border px-3 py-2 text-sm">Cancel</button>
              <button onClick={save} disabled={upsert.isPending} className="rounded-lg bg-sk-coral px-3 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}