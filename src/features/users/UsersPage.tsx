import { useState } from "react";
import { UserPlus, Loader2, Power, Mail, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { toast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useTenantMembers, useSetUserStatus, useRemoveTenantUser, resendInvite, type TenantUserRow } from "./queries";
import InviteUserModal from "./InviteUserModal";
import EditUserRolesDrawer from "./EditUserRolesDrawer";

export default function UsersPage() {
  const { currentTenant } = useCurrentUser();
  const tenantId = currentTenant?.id ?? "";
  const q = useTenantMembers(tenantId);
  const setStatus = useSetUserStatus(tenantId);
  const removeUser = useRemoveTenantUser(tenantId);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<TenantUserRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleActive(row: TenantUserRow) {
    const nextStatus = row.status === "active" ? "inactive" : "active";
    try {
      await setStatus.mutateAsync({ tenantUserId: row.id, status: nextStatus });
      toast({ title: nextStatus === "active" ? "User activated" : "User deactivated" });
    } catch (e: any) {
      toast({ title: "Couldn't update status", description: e.message, variant: "destructive" });
    }
  }

  async function onResend(row: TenantUserRow) {
    setBusyId(row.id);
    const res = await resendInvite({ tenantId, email: row.profile.email, fullName: row.profile.full_name });
    setBusyId(null);
    if (res.ok === true) {
      toast({ title: "Invite resent", description: row.profile.email });
    } else {
      toast({ title: "Couldn't resend invite", description: (res as { error: string }).error, variant: "destructive" });
    }
  }

  async function onRemove(row: TenantUserRow) {
    if (!confirm(`Remove ${row.profile.full_name ?? row.profile.email} from this tenant?`)) return;
    try {
      await removeUser.mutateAsync(row.id);
      toast({ title: "User removed" });
    } catch (e: any) {
      toast({ title: "Couldn't remove user", description: e.message, variant: "destructive" });
    }
  }

  return (
    <>
      <AppHeader
        title="Users & roles"
        subtitle="Staff accounts and what they can do."
        actions={
          <button
            onClick={() => setInviting(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-3 py-2 text-sm font-medium text-white hover:bg-sk-coral-dark"
          >
            <UserPlus className="h-4 w-4" /> Add user
          </button>
        }
      />
      <div className="flex-1 p-6">
        <div className="sk-card overflow-hidden">
          {q.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
            </div>
          ) : q.error ? (
            <div className="p-6 text-sm text-red-600">Couldn't load users: {(q.error as any).message}</div>
          ) : !q.data?.length ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No staff members yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-sk-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.data.map((row) => (
                  <tr key={row.id} className="hover:bg-sk-surface-muted/50">
                    <td className="px-4 py-3 font-medium">
                      {row.profile.full_name ?? "—"}
                      {row.is_primary_contact && (
                        <span className="ml-2 rounded-full bg-sk-coral-soft px-2 py-0.5 text-[10px] font-semibold text-sk-coral-dark">
                          Primary
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.profile.email}</td>
                    <td className="px-4 py-3">
                      {row.roles.length ? (
                        <div className="flex flex-wrap gap-1">
                          {row.roles.map((r) => (
                            <span
                              key={r.id}
                              className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium"
                            >
                              {r.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">No roles</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          row.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditing(row)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          Edit roles
                        </button>
                        <button
                          onClick={() => toggleActive(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                          title={row.status === "active" ? "Deactivate" : "Activate"}
                        >
                          <Power className="h-3.5 w-3.5" />
                          {row.status === "active" ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => onResend(row)}
                          disabled={busyId === row.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                          title="Resend invite email"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          Resend
                        </button>
                        {!row.is_primary_contact && (
                          <button
                            onClick={() => onRemove(row)}
                            disabled={removeUser.isPending}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                            title="Remove from tenant"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {inviting && (
        <InviteUserModal
          tenantId={tenantId}
          onClose={() => setInviting(false)}
          onSaved={() => q.refetch()}
        />
      )}
      {editing && (
        <EditUserRolesDrawer
          tenantId={tenantId}
          user={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}