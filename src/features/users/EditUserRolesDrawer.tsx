import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { ModalShell } from "@/components/modals/ModalShell";
import { useAssignableRoles, useSetUserRoles, type TenantUserRow } from "./queries";

interface Props {
  tenantId: string;
  user: TenantUserRow;
  onClose: () => void;
}

export default function EditUserRolesDrawer({ tenantId, user, onClose }: Props) {
  const rolesQ = useAssignableRoles(tenantId);
  const setRoles = useSetUserRoles(tenantId);
  const [selected, setSelected] = useState<Set<string>>(new Set(user.roles.map((r) => r.id)));

  useEffect(() => {
    setSelected(new Set(user.roles.map((r) => r.id)));
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSave() {
    try {
      await setRoles.mutateAsync({ tenantUserId: user.id, roleIds: Array.from(selected) });
      toast({ title: "Roles updated" });
      onClose();
    } catch (e: any) {
      toast({ title: "Couldn't update roles", description: e.message, variant: "destructive" });
    }
  }

  return (
    <ModalShell
      title={user.profile.full_name ?? user.profile.email}
      subtitle={user.profile.email}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={setRoles.isPending}
            className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-medium text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {setRoles.isPending ? "Saving…" : "Save roles"}
          </button>
        </div>
      }
    >
      <div className="p-6">
        <div className="mb-3 text-sm font-medium">Roles</div>
        {rolesQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading roles…</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {(rolesQ.data ?? []).map((r) => (
              <label
                key={r.id}
                className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm hover:border-sk-coral"
              >
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="font-medium">{r.label}</div>
                  {r.description && (
                    <div className="text-xs text-muted-foreground">{r.description}</div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}