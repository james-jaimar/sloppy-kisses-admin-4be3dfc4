import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useVaccinationRules, useUpsertVaccinationRule, useDeleteVaccinationRule, type VaccinationRule } from "@/features/comms/queries";

const SERVICES = [
  { v: "daycare", l: "Daycare" },
  { v: "daycare_assessment", l: "Daycare assessment" },
  { v: "hotel_dog", l: "Hotel — dog" },
  { v: "hotel_cat", l: "Hotel — cat" },
  { v: "grooming_inhouse", l: "Grooming (in-house)" },
  { v: "grooming_mobile", l: "Grooming (mobile)" },
  { v: "pickup_dropoff", l: "Pick up / drop-off" },
] as const;

export default function VaccinationRulesPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission("settings.vaccination.manage");
  const rulesQ = useVaccinationRules(tenantId);
  const upsert = useUpsertVaccinationRule(tenantId ?? "");
  const del = useDeleteVaccinationRule(tenantId ?? "");

  const [draft, setDraft] = useState({ service_type: "daycare", vaccine_type: "", species: "dog", grace_days: 0, required: true });

  const grouped = useMemo(() => {
    const map = new Map<string, VaccinationRule[]>();
    for (const r of rulesQ.data ?? []) {
      const arr = map.get(r.service_type) ?? [];
      arr.push(r);
      map.set(r.service_type, arr);
    }
    return map;
  }, [rulesQ.data]);

  async function addRule() {
    if (!draft.vaccine_type.trim()) return toast.error("Vaccine required");
    try {
      await upsert.mutateAsync({
        service_type: draft.service_type as any,
        vaccine_type: draft.vaccine_type.trim(),
        species: draft.species,
        grace_days: draft.grace_days,
        required: draft.required,
      });
      toast.success("Added");
      setDraft({ ...draft, vaccine_type: "" });
    } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <>
      <AppHeader title="Vaccination rules" subtitle="Per-service vaccine requirements." />
      <div className="flex-1 space-y-4 p-6">
        <div className="sk-card p-4">
          {!canManage && (
            <div className="mb-3 rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
              Read-only. Requires "Manage vaccination rules".
            </div>
          )}
          <div className="grid gap-2 md:grid-cols-6">
            <select disabled={!canManage} value={draft.service_type} onChange={(e) => setDraft({ ...draft, service_type: e.target.value })}
              className="h-10 rounded-lg border border-border bg-white px-2 text-sm">
              {SERVICES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
            <select disabled={!canManage} value={draft.species} onChange={(e) => setDraft({ ...draft, species: e.target.value })}
              className="h-10 rounded-lg border border-border bg-white px-2 text-sm">
              <option value="dog">Dog</option><option value="cat">Cat</option>
            </select>
            <input disabled={!canManage} placeholder="e.g. rabies, 5-in-1" value={draft.vaccine_type} onChange={(e) => setDraft({ ...draft, vaccine_type: e.target.value })}
              className="h-10 rounded-lg border border-border bg-white px-3 text-sm md:col-span-2" />
            <input type="number" disabled={!canManage} placeholder="Grace days" value={draft.grace_days} onChange={(e) => setDraft({ ...draft, grace_days: Number(e.target.value) })}
              className="h-10 rounded-lg border border-border bg-white px-3 text-sm" />
            <button disabled={!canManage || upsert.isPending} onClick={addRule}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>

        {SERVICES.map((s) => {
          const rows = grouped.get(s.v) ?? [];
          if (!rows.length) return null;
          return (
            <div key={s.v} className="sk-card">
              <div className="border-b border-border px-4 py-2 text-sm font-semibold">{s.l}</div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2 text-left">Vaccine</th><th className="px-4 py-2 text-left">Species</th><th className="px-4 py-2 text-left">Grace (days)</th><th className="px-4 py-2 text-left">Required</th><th /></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-2 font-medium">{r.vaccine_type}</td>
                      <td className="px-4 py-2">{r.species}</td>
                      <td className="px-4 py-2">{r.grace_days}</td>
                      <td className="px-4 py-2">{r.required ? "Yes" : "No"}</td>
                      <td className="px-4 py-2 text-right">
                        {canManage && (
                          <button onClick={() => { if (confirm("Delete rule?")) del.mutate(r.id); }}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-sk-coral-dark hover:bg-sk-coral-soft">
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </>
  );
}