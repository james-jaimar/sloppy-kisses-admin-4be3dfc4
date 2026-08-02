import { useMemo, useState } from "react";
import { toast } from "sonner";
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { ServiceType } from "@/features/bookings/queries";
import {
  useChecklistTemplates, useDeleteChecklistTemplate, useUpsertChecklistTemplate,
  type ChecklistTemplate,
} from "@/features/work/queries";

const SERVICES: { key: ServiceType; label: string }[] = [
  { key: "grooming_inhouse", label: "Grooming (in-house)" },
  { key: "grooming_mobile", label: "Grooming (mobile)" },
  { key: "hotel_dog", label: "Hotel — dog" },
  { key: "hotel_cat", label: "Cattery" },
  { key: "daycare", label: "Daycare" },
  { key: "daycare_assessment", label: "Daycare assessment" },
  { key: "pickup_dropoff", label: "Pick up / drop-off" },
];

export default function JobChecklistsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const confirm = useConfirm();
  const [service, setService] = useState<ServiceType>("grooming_inhouse");
  const [newLabel, setNewLabel] = useState("");

  const listQ = useChecklistTemplates(tenantId, service);
  const upsert = useUpsertChecklistTemplate(tenantId ?? "");
  const del = useDeleteChecklistTemplate();

  const items = useMemo(
    () => [...(listQ.data ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [listQ.data],
  );

  async function save(row: Partial<ChecklistTemplate> & { service_type: ServiceType; label: string }) {
    try {
      await upsert.mutateAsync(row);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't save");
    }
  }

  return (
    <>
      <AppHeader
        title="Job checklists"
        subtitle="Steps staff tick off in Work mode, per service"
      />
      <div className="flex-1 space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {SERVICES.map((s) => (
            <button
              key={s.key}
              onClick={() => setService(s.key)}
              className={`h-10 rounded-xl border px-3 text-sm font-medium ${
                service === s.key
                  ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark"
                  : "border-border bg-white hover:bg-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="sk-card p-4 sm:p-5">
          {listQ.isLoading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No checklist steps for this service yet. Add the first one below.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item, i) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    defaultValue={item.label}
                    onBlur={(e) => {
                      const label = e.target.value.trim();
                      if (label && label !== item.label) {
                        save({ id: item.id, service_type: service, label });
                      }
                    }}
                    className="h-10 min-w-[12rem] flex-1 rounded-xl border border-border px-3 text-sm"
                  />
                  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={item.requires_note}
                      onChange={(e) =>
                        save({ id: item.id, service_type: service, label: item.label, requires_note: e.target.checked })
                      }
                    />
                    Needs a note
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={item.is_active}
                      onChange={(e) =>
                        save({ id: item.id, service_type: service, label: item.label, is_active: e.target.checked })
                      }
                    />
                    Active
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={i === 0}
                      onClick={() => {
                        const prev = items[i - 1];
                        save({ id: item.id, service_type: service, label: item.label, sort_order: prev.sort_order });
                        save({ id: prev.id, service_type: service, label: prev.label, sort_order: item.sort_order });
                      }}
                      className="h-9 rounded-lg border border-border px-2 text-xs disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      disabled={i === items.length - 1}
                      onClick={() => {
                        const next = items[i + 1];
                        save({ id: item.id, service_type: service, label: item.label, sort_order: next.sort_order });
                        save({ id: next.id, service_type: service, label: next.label, sort_order: item.sort_order });
                      }}
                      className="h-9 rounded-lg border border-border px-2 text-xs disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      onClick={async () => {
                        if (!(await confirm({ title: `Delete "${item.label}"?`, confirmLabel: "Delete", tone: "destructive" }))) return;
                        try {
                          await del.mutateAsync(item.id);
                        } catch (err: any) {
                          toast.error(err?.message ?? "Couldn't delete");
                        }
                      }}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-border text-sk-coral-dark hover:bg-sk-coral-soft"
                      aria-label="Delete step"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const label = newLabel.trim();
              if (!label) return;
              const sort = (items[items.length - 1]?.sort_order ?? 0) + 10;
              await save({ service_type: service, label, sort_order: sort, is_active: true, requires_note: false });
              setNewLabel("");
            }}
            className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4"
          >
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Add a step, e.g. Nails clipped"
              className="h-10 min-w-[12rem] flex-1 rounded-xl border border-border px-3 text-sm"
            />
            <button
              type="submit"
              disabled={upsert.isPending || !newLabel.trim()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Add step
            </button>
          </form>
        </div>
      </div>
    </>
  );
}