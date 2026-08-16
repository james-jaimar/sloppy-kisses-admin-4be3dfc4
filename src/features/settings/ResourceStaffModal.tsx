import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ModalShell } from "@/components/modals/ModalShell";
import { useTenantMembers } from "@/features/users/queries";
import { useResourceStaff, useSetResourceStaff } from "./resourceStaffQueries";
import type { ResourceRow } from "./resourceQueries";

interface Props {
  tenantId: string;
  resource: ResourceRow;
  onClose: () => void;
}

export function ResourceStaffModal({ tenantId, resource, onClose }: Props) {
  const membersQ = useTenantMembers(tenantId);
  const assignmentsQ = useResourceStaff(tenantId);
  const save = useSetResourceStaff(tenantId);
  const [selected, setSelected] = useState<string[]>([]);

  const current = useMemo(
    () => (assignmentsQ.data ?? []).filter((a) => a.resource_id === resource.id).map((a) => a.profile_id),
    [assignmentsQ.data, resource.id],
  );
  useEffect(() => { setSelected(current); }, [current.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function onSave() {
    try {
      await save.mutateAsync({ resourceId: resource.id, profileIds: selected });
      toast.success("Staff updated");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    }
  }

  return (
    <ModalShell
      title={`Staff on ${resource.name}`}
      subtitle="Only these people see this resource's jobs in work mode. Leave empty for no restriction."
      onClose={onClose}
    >
      <div className="space-y-4 p-6">
        {membersQ.isLoading && <div className="text-sm text-muted-foreground">Loading staff…</div>}
        <div className="grid gap-2 sm:grid-cols-2">
          {(membersQ.data ?? []).map((m) => (
            <label
              key={m.profile_id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.includes(m.profile_id)}
                onChange={() => toggle(m.profile_id)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{m.profile.full_name ?? m.profile.email}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {m.roles.map((r) => r.label).join(", ") || "No role"}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={save.isPending}
            className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-medium text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save staff"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
