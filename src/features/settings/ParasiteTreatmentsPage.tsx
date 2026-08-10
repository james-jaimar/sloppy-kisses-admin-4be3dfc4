import { useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import {
  useDeleteParasiteRule,
  useParasiteRules,
  useUpsertParasiteRule,
  type GateMode,
  type ParasiteRule,
} from "@/features/pets/healthQueries";

const PERMISSION = "settings.policies.manage";

const GATE_LABEL: Record<GateMode, string> = {
  off: "Off — don't check",
  warn: "Warn staff at booking and arrival",
  block: "Block attendance until it's up to date",
};

type Draft = Partial<ParasiteRule>;

function empty(): Draft {
  return { kind: "", label: "", interval_days: 90, grace_days: 7, gate_mode: "warn", species: "all", chargeable_on_arrival: false, active: true, sort_order: 100 };
}

function slug(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export default function ParasiteTreatmentsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);
  const confirm = useConfirm();

  const listQ = useParasiteRules(tenantId);
  const upsert = useUpsertParasiteRule(tenantId);
  const del = useDeleteParasiteRule();

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});

  async function save(isNew: boolean) {
    const label = (draft.label ?? "").trim();
    if (!label) { toast.error("Name is required"); return; }
    try {
      await upsert.mutateAsync({
        ...(isNew ? {} : { id: editingId! }),
        kind: draft.kind?.trim() || slug(label),
        label,
        interval_days: Number(draft.interval_days ?? 90),
        grace_days: Number(draft.grace_days ?? 7),
        gate_mode: (draft.gate_mode ?? "warn") as GateMode,
        species: draft.species ?? "all",
        chargeable_on_arrival: draft.chargeable_on_arrival ?? false,
        active: draft.active ?? true,
        sort_order: Number(draft.sort_order ?? 100),
      } as any);
      toast.success(isNew ? "Treatment added" : "Treatment updated");
      setCreating(false); setEditingId(null); setDraft({});
    } catch (e: any) { toast.error(e?.message ?? "Failed to save"); }
  }

  const rows = listQ.data ?? [];

  return (
    <>
      <AppHeader
        title="Parasite &amp; preventative treatments"
        subtitle="Tick & flea, deworming and kennel cough schedules. Drives the arrival gate and the reminders owners see in the portal."
        actions={canManage ? (
          <button
            onClick={() => { setCreating(true); setEditingId(null); setDraft(empty()); }}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark"
          >
            <Plus className="h-4 w-4" /> New treatment
          </button>
        ) : null}
      />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        {!canManage && (
          <div className="sk-card p-4 text-sm text-muted-foreground">
            Read-only view. Ask an admin with the <code>settings.policies.manage</code> permission to make changes.
          </div>
        )}

        <div className="sk-card p-4 text-xs text-muted-foreground">
          A pet is flagged once the treatment is older than its interval plus the grace days. When a treatment is marked
          chargeable, staff can apply it on arrival from the booking and the fee set under Policies is added to the
          invoice automatically.
        </div>

        <div className="sk-card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Treatment</th>
                <th className="px-4 py-3">Every</th>
                <th className="px-4 py-3">Grace</th>
                <th className="px-4 py-3">Gate</th>
                <th className="px-4 py-3">On arrival</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {creating && <EditRow draft={draft} setDraft={setDraft} onSave={() => save(true)} onCancel={() => { setCreating(false); setDraft({}); }} isNew />}
              {listQ.isLoading && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!listQ.isLoading && rows.length === 0 && !creating && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No treatments configured yet.</td></tr>
              )}
              {rows.map((r) =>
                editingId === r.id ? (
                  <EditRow key={r.id} draft={draft} setDraft={setDraft} onSave={() => save(false)} onCancel={() => { setEditingId(null); setDraft({}); }} />
                ) : (
                  <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                    <td className="px-4 py-3 font-medium">{r.label}</td>
                    <td className="px-4 py-3">{r.interval_days} days</td>
                    <td className="px-4 py-3">{r.grace_days} days</td>
                    <td className="px-4 py-3 text-xs">{GATE_LABEL[r.gate_mode]}</td>
                    <td className="px-4 py-3 text-xs">{r.chargeable_on_arrival ? "Chargeable treatment" : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (r.active ? "bg-sk-green-soft text-sk-green" : "bg-muted text-muted-foreground")}>
                        {r.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && (
                          <>
                            <button onClick={() => { setEditingId(r.id); setDraft({ ...r }); setCreating(false); }} className="rounded-lg px-3 py-1 text-xs font-medium text-sk-coral-dark hover:bg-sk-coral-soft">Edit</button>
                            <button
                              onClick={async () => {
                                if (!(await confirm({ title: `Delete "${r.label}"?`, description: "Recorded treatments on pets are kept.", confirmLabel: "Delete", tone: "destructive" }))) return;
                                try { await del.mutateAsync(r.id); toast.success("Deleted"); }
                                catch (e: any) { toast.error(e?.message ?? "Failed to delete"); }
                              }}
                              className="grid h-8 w-8 place-items-center rounded text-sk-coral-dark hover:bg-sk-coral-soft"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function EditRow({
  draft, setDraft, onSave, onCancel, isNew,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
}) {
  return (
    <tr className="bg-sk-coral-soft/40">
      <td className="px-4 py-2">
        <input autoFocus placeholder="e.g. Tick & flea" value={draft.label ?? ""} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="h-8 w-full rounded border border-border bg-white px-2 text-sm" />
      </td>
      <td className="px-4 py-2">
        <input type="number" min={1} value={draft.interval_days ?? 90} onChange={(e) => setDraft({ ...draft, interval_days: Number(e.target.value) })} className="h-8 w-20 rounded border border-border bg-white px-2 text-sm" />
      </td>
      <td className="px-4 py-2">
        <input type="number" min={0} value={draft.grace_days ?? 7} onChange={(e) => setDraft({ ...draft, grace_days: Number(e.target.value) })} className="h-8 w-20 rounded border border-border bg-white px-2 text-sm" />
      </td>
      <td className="px-4 py-2">
        <select value={draft.gate_mode ?? "warn"} onChange={(e) => setDraft({ ...draft, gate_mode: e.target.value as GateMode })} className="h-8 rounded border border-border bg-white px-2 text-xs">
          {(Object.keys(GATE_LABEL) as GateMode[]).map((m) => <option key={m} value={m}>{GATE_LABEL[m]}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={draft.chargeable_on_arrival ?? false} onChange={(e) => setDraft({ ...draft, chargeable_on_arrival: e.target.checked })} className="h-4 w-4" />
          Chargeable
        </label>
      </td>
      <td className="px-4 py-2">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={draft.active ?? true} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="h-4 w-4" />
          Active
        </label>
      </td>
      <td className="px-4 py-2">
        <div className="flex justify-end gap-1">
          <button onClick={onSave} className="grid h-8 w-8 place-items-center rounded text-sk-green hover:bg-sk-green-soft" title={isNew ? "Add" : "Save"}><Save className="h-4 w-4" /></button>
          <button onClick={onCancel} className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
      </td>
    </tr>
  );
}