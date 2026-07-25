import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  useAllInstructionGroups,
  useAllInstructionOptions,
  useUpsertInstructionGroup,
  useDeleteInstructionGroup,
  useUpsertInstructionOption,
  useDeleteInstructionOption,
  type GroupKind,
  type InstructionGroup,
} from "@/features/grooming/instructions/queries";

const PERMISSION = "settings.grooming.manage";

export default function GroomingInstructionsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);
  const confirm = useConfirm();

  const groupsQ = useAllInstructionGroups(tenantId);
  const optsQ = useAllInstructionOptions(tenantId);
  const upsertGroup = useUpsertInstructionGroup(tenantId ?? "");
  const delGroup = useDeleteInstructionGroup();
  const upsertOpt = useUpsertInstructionOption(tenantId ?? "");
  const delOpt = useDeleteInstructionOption();

  const [openId, setOpenId] = useState<string | null>(null);

  async function addGroup() {
    const code = window.prompt("Group code (a_b_c, no spaces)")?.trim();
    if (!code) return;
    const label = window.prompt("Group label")?.trim();
    if (!label) return;
    try {
      await upsertGroup.mutateAsync({ code, label, kind: "single", sort_order: 500, active: true, is_medical: false });
      toast.success("Group added");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function removeGroup(g: InstructionGroup) {
    const ok = await confirm({ title: "Delete group?", description: `Remove "${g.label}" and all its options.`, confirmLabel: "Delete", variant: "destructive" });
    if (!ok) return;
    try { await delGroup.mutateAsync(g.id); toast.success("Deleted"); } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function addOption(g: InstructionGroup) {
    const code = window.prompt(`Option code for ${g.label}`)?.trim();
    if (!code) return;
    const label = window.prompt("Option label")?.trim();
    if (!label) return;
    try {
      await upsertOpt.mutateAsync({ group_id: g.id, code, label, sort_order: 500, active: true, is_alert: g.is_medical });
      toast.success("Option added");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  const groups = groupsQ.data ?? [];
  const options = optsQ.data ?? [];

  return (
    <>
      <AppHeader title="Grooming instructions"
        subtitle="Groups and options shown to staff and customers when booking a groom. Customers can save these as a pet default."
      />
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {!canManage && (
            <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
              Read-only — requires "Manage grooming rate card" permission.
            </div>
          )}
          <div className="flex justify-end">
            <button disabled={!canManage} onClick={addGroup}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white disabled:opacity-50">
              <Plus className="h-4 w-4" /> New group
            </button>
          </div>
          {groups.map((g) => {
            const gOpts = options.filter((o) => o.group_id === g.id);
            const open = openId === g.id;
            return (
              <div key={g.id} className="sk-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button className="text-left font-semibold" onClick={() => setOpenId(open ? null : g.id)}>
                    {g.label} <span className="text-xs text-muted-foreground">({g.code} · {g.kind}{g.is_medical ? " · medical" : ""})</span>
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <input type="number" disabled={!canManage} value={g.sort_order}
                      onChange={(e) => upsertGroup.mutate({ ...g, sort_order: Number(e.target.value) })}
                      className="h-8 w-16 rounded border border-border px-2 text-xs" />
                    <select disabled={!canManage} value={g.kind}
                      onChange={(e) => upsertGroup.mutate({ ...g, kind: e.target.value as GroupKind })}
                      className="h-8 rounded border border-border px-2 text-xs">
                      <option value="single">single</option>
                      <option value="multi">multi</option>
                      <option value="text">text</option>
                      <option value="number">number</option>
                      <option value="bool">bool</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" disabled={!canManage} checked={g.is_medical}
                        onChange={(e) => upsertGroup.mutate({ ...g, is_medical: e.target.checked })} /> medical
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" disabled={!canManage} checked={g.active}
                        onChange={(e) => upsertGroup.mutate({ ...g, active: e.target.checked })} /> active
                    </label>
                    <button disabled={!canManage} onClick={() => removeGroup(g)}
                      className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                {open && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    {gOpts.map((o) => (
                      <div key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <input disabled={!canManage} value={o.label}
                          onChange={(e) => upsertOpt.mutate({ ...o, label: e.target.value })}
                          className="h-8 flex-1 min-w-[160px] rounded border border-border px-2" />
                        <input disabled={!canManage} value={o.code}
                          onChange={(e) => upsertOpt.mutate({ ...o, code: e.target.value })}
                          className="h-8 w-32 rounded border border-border px-2 text-xs text-muted-foreground" />
                        <input type="number" disabled={!canManage} value={o.sort_order}
                          onChange={(e) => upsertOpt.mutate({ ...o, sort_order: Number(e.target.value) })}
                          className="h-8 w-16 rounded border border-border px-2 text-xs" />
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" disabled={!canManage} checked={o.is_alert}
                            onChange={(e) => upsertOpt.mutate({ ...o, is_alert: e.target.checked })} /> alert
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" disabled={!canManage} checked={o.active}
                            onChange={(e) => upsertOpt.mutate({ ...o, active: e.target.checked })} /> active
                        </label>
                        <button disabled={!canManage} onClick={() => delOpt.mutate(o.id)}
                          className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <button disabled={!canManage} onClick={() => addOption(g)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs">
                      <Plus className="h-3 w-3" /> Add option
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}