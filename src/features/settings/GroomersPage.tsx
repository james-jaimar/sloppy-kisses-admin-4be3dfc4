import { useState } from "react";
import { Plus, Pencil, Power, Scissors } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ResourceFormModal } from "./ResourceFormModal";
import { useGroomers, useUpdateResource, useDeleteResource, type ResourceRow } from "./resourceQueries";

export default function GroomersPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const confirm = useConfirm();
  const groomersQ = useGroomers(tenantId);
  const update = useUpdateResource(tenantId ?? "");
  const deactivate = useDeleteResource(tenantId ?? "");

  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [creating, setCreating] = useState(false);

  const groomers = groomersQ.data ?? [];

  async function handleDeactivate(g: ResourceRow) {
    if (!(await confirm({
      title: `Remove ${g.name} from the diary?`,
      description: "Existing appointments keep their groomer. New bookings won't be assigned to them.",
      confirmLabel: "Remove",
      tone: "destructive",
    }))) return;
    try {
      await deactivate.mutateAsync(g.id);
      toast.success("Groomer removed from the diary");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update groomer");
    }
  }

  return (
    <>
      <AppHeader
        title="Groomers"
        subtitle="Who is on the floor, their hours and their diary colour. Bookings can be auto-assigned to the next free groomer."
        actions={
          <button
            onClick={() => setCreating(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark"
          >
            <Plus className="h-4 w-4" /> Add groomer
          </button>
        }
      />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groomersQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!groomersQ.isLoading && groomers.length === 0 && (
            <div className="sk-card p-6 text-sm text-muted-foreground">
              No groomers yet. Add one so appointments can be assigned.
            </div>
          )}
          {groomers.map((g) => (
            <div key={g.id} className={"sk-card p-4 " + (g.active ? "" : "opacity-60")}>
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
                  style={{ backgroundColor: g.colour ?? "#F97362" }}
                >
                  <Scissors className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{g.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {(g.workday_start ?? "08:00").slice(0, 5)} – {(g.workday_end ?? "17:00").slice(0, 5)}
                    {g.active ? "" : " · not on the diary"}
                  </div>
                  {g.description && <div className="mt-1 text-xs text-muted-foreground">{g.description}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(g)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {g.active ? (
                    <button
                      onClick={() => handleDeactivate(g)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                      title="Remove from diary"
                    >
                      <Power className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => update.mutate({ id: g.id, patch: { active: true } })}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-sk-coral-dark hover:bg-sk-coral-soft"
                    >
                      Restore
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          When a booking is left on “Auto-assign”, the next free groomer at that time is used. Customers with a
          preferred groomer are placed with them whenever that groomer is free.
        </p>
      </div>

      {(editing || creating) && tenantId && (
        <ResourceFormModal
          tenantId={tenantId}
          resource={editing}
          lockType="inhouse_grooming"
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </>
  );
}