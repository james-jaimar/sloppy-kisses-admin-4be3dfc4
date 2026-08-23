import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useGroomingAddons } from "@/features/settings/groomingRateCardQueries";
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
import {
  BRIEF_COLOURS, BRIEF_COLOUR_NAMES, BRIEF_ICON_NAMES, briefColour, briefIcon,
} from "@/features/grooming/instructions/briefIcons";

const PERMISSION = "settings.grooming.manage";

export default function GroomingInstructionsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);
  const confirm = useConfirm();

  const groupsQ = useAllInstructionGroups(tenantId);
  const optsQ = useAllInstructionOptions(tenantId);
  const addonsQ = useGroomingAddons(tenantId, { activeOnly: true });
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
    const ok = await confirm({ title: "Delete group?", description: `Remove "${g.label}" and all its options.`, confirmLabel: "Delete" });
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
  const addons = addonsQ.data ?? [];

  return (
    <>
      <AppHeader title="Grooming instructions"
        subtitle="Groups and options shown when booking a groom, and the icons groomers tick off in Work mode."
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
                  {(() => {
                    const Icon = briefIcon(g.icon);
                    return (
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${briefColour(g.colour).chip}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                    );
                  })()}
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
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Work mode icon &amp; colour
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {BRIEF_ICON_NAMES.map((name) => {
                          const Icon = briefIcon(name);
                          const on = (g.icon ?? "scissors") === name;
                          return (
                            <button key={name} type="button" disabled={!canManage} title={name}
                              onClick={() => upsertGroup.mutate({ ...g, icon: name })}
                              className={`grid h-9 w-9 place-items-center rounded-lg border ${on ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border hover:bg-muted"}`}>
                              <Icon className="h-4 w-4" />
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {BRIEF_COLOUR_NAMES.map((name) => {
                          const on = (g.colour ?? "muted") === name;
                          return (
                            <button key={name} type="button" disabled={!canManage}
                              onClick={() => upsertGroup.mutate({ ...g, colour: name })}
                              className={`inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-xs font-semibold ${on ? "border-sk-coral" : "border-border hover:bg-muted"}`}>
                              <span className={`h-3.5 w-3.5 rounded-full ${BRIEF_COLOURS[name].swatch}`} />
                              {BRIEF_COLOURS[name].label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {gOpts.map((o) => (
                      <div key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <input disabled={!canManage} value={o.label}
                          onChange={(e) => upsertOpt.mutate({ ...o, label: e.target.value })}
                          className="h-8 flex-1 min-w-[160px] rounded border border-border px-2" />
                        <input disabled={!canManage} value={o.code}
                          onChange={(e) => upsertOpt.mutate({ ...o, code: e.target.value })}
                          className="h-8 w-32 rounded border border-border px-2 text-xs text-muted-foreground" />
                        <select disabled={!canManage} value={o.addon_code ?? ""}
                          onChange={(e) => upsertOpt.mutate({ ...o, addon_code: e.target.value || null })}
                          title="Link to rate-card add-on (auto-adds to booking price when ticked)"
                          className="h-8 w-44 rounded border border-border px-2 text-xs">
                          <option value="">— no charge —</option>
                          {addons.map((a) => (
                            <option key={a.id} value={a.code}>{a.name} (R{Math.round(Number(a.price_zar))})</option>
                          ))}
                        </select>
                        <input type="number" disabled={!canManage} value={o.sort_order}
                          onChange={(e) => upsertOpt.mutate({ ...o, sort_order: Number(e.target.value) })}
                          className="h-8 w-16 rounded border border-border px-2 text-xs" />
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" disabled={!canManage} checked={o.is_alert}
                            onChange={(e) => upsertOpt.mutate({ ...o, is_alert: e.target.checked })} /> alert
                        </label>
                        <label className="flex items-center gap-1 text-xs" title="Means 'do nothing' — greyed out and struck through in Work mode, no tick required">
                          <input type="checkbox" disabled={!canManage} checked={Boolean(o.no_action)}
                            onChange={(e) => upsertOpt.mutate({ ...o, no_action: e.target.checked })} /> leave it
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