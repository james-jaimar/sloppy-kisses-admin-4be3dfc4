import { useMemo, useState } from "react";
import { Plus, Pencil, Power, Search } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import {
  RESOURCE_TYPES,
  useAllResources,
  useDeleteResource,
  useUpdateResource,
  type ResourceRow,
} from "./resourceQueries";
import { ResourceFormModal } from "./ResourceFormModal";

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  RESOURCE_TYPES.map((t) => [t.value, t.label]),
);

export default function ResourcesPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const resourcesQ = useAllResources(tenantId);
  const deactivate = useDeleteResource(tenantId ?? "");
  const update = useUpdateResource(tenantId ?? "");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (resourcesQ.data ?? []).filter((r) => {
      if (!showInactive && !r.active) return false;
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (s && !r.name.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [resourcesQ.data, search, typeFilter, showInactive]);

  async function handleDeactivate(r: ResourceRow) {
    if (!confirm(`Deactivate "${r.name}"? Existing bookings keep their assignment.`)) return;
    try {
      await deactivate.mutateAsync(r.id);
      toast.success("Resource deactivated");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to deactivate");
    }
  }

  async function handleReactivate(r: ResourceRow) {
    try {
      await update.mutateAsync({ id: r.id, patch: { active: true } });
      toast.success("Resource reactivated");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to reactivate");
    }
  }

  return (
    <>
      <AppHeader
        title="Resources"
        subtitle="Groomers, mobile vans, kennels, runs and daycare areas that bookings can be assigned to."
        actions={
          <button
            onClick={() => setCreating(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark"
          >
            <Plus className="h-4 w-4" /> New resource
          </button>
        }
      />
      <div className="flex-1 space-y-4 p-6">
        <div className="sk-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search resources..."
                className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 rounded-lg border border-border bg-white px-3 text-sm outline-none"
            >
              <option value="all">All types</option>
              {RESOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="h-4 w-4"
              />
              Show inactive
            </label>
          </div>
        </div>

        <div className="sk-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Capacity</th>
                <th className="px-4 py-3">Sort</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {resourcesQ.isLoading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!resourcesQ.isLoading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No resources match.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                  </td>
                  <td className="px-4 py-3">{TYPE_LABEL[r.type] ?? r.type}</td>
                  <td className="px-4 py-3 tabular-nums">{r.capacity ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{r.sort_order}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium " +
                        (r.active ? "bg-sk-green-soft text-sk-green" : "bg-muted text-muted-foreground")
                      }
                    >
                      {r.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditing(r)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {r.active ? (
                        <button
                          onClick={() => handleDeactivate(r)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                          title="Deactivate"
                        >
                          <Power className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(r)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-sk-coral-dark hover:bg-sk-coral-soft"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(editing || creating) && tenantId && (
        <ResourceFormModal
          tenantId={tenantId}
          resource={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </>
  );
}