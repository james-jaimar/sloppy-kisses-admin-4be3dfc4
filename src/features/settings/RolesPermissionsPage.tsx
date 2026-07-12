import { useMemo, useState } from "react";
import { Check, Loader2, Plus, Pencil, Trash2, Lock } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { toast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import {
  useAssignableRoles,
  usePermissionsCatalog,
  useRolePermissionsMatrix,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useToggleRolePermission,
  type RoleRow,
} from "@/features/users/queries";

export default function RolesPermissionsPage() {
  const { currentTenant, hasPermission } = useCurrentUser();
  const tenantId = currentTenant?.id ?? "";
  const rolesQ = useAssignableRoles(tenantId);
  const permsQ = usePermissionsCatalog();
  const matrixQ = useRolePermissionsMatrix();
  const canManage = hasPermission("users.manage");
  const createRole = useCreateRole(tenantId);
  const updateRole = useUpdateRole(tenantId);
  const deleteRole = useDeleteRole(tenantId);
  const toggle = useToggleRolePermission();
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [creating, setCreating] = useState(false);

  const grouped = useMemo(() => {
    const by: Record<string, { code: string; label: string }[]> = {};
    for (const p of permsQ.data ?? []) {
      const module = p.code.split(".")[0] ?? "other";
      (by[module] ||= []).push({ code: p.code, label: p.label });
    }
    for (const arr of Object.values(by)) arr.sort((a, b) => a.code.localeCompare(b.code));
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  }, [permsQ.data]);

  const loading = rolesQ.isLoading || permsQ.isLoading || matrixQ.isLoading;
  const matrix = matrixQ.data ?? { byCode: {}, byId: new Set<string>() };
  const roles = rolesQ.data ?? [];
  const permsById = useMemo(() => {
    const m = new Map<string, string>(); // code -> id
    for (const p of permsQ.data ?? []) m.set(p.code, p.id);
    return m;
  }, [permsQ.data]);

  async function onToggle(role: RoleRow, permCode: string) {
    if (role.is_system_role) return;
    const permId = permsById.get(permCode);
    if (!permId) return;
    const key = `${role.id}:${permId}`;
    const enabled = !matrix.byId.has(key);
    try {
      await toggle.mutateAsync({ roleId: role.id, permissionId: permId, enabled });
    } catch (e: any) {
      toast({ title: "Couldn't update permission", description: e.message, variant: "destructive" });
    }
  }

  async function onDelete(role: RoleRow) {
    if (!confirm(`Delete role "${role.label}"? Users assigned this role will lose it.`)) return;
    try {
      await deleteRole.mutateAsync(role.id);
      toast({ title: "Role deleted" });
    } catch (e: any) {
      toast({ title: "Couldn't delete role", description: e.message, variant: "destructive" });
    }
  }

  return (
    <>
      <AppHeader
        title="Roles & permissions"
        subtitle="Create roles and tick the permissions each role should have. System roles are locked."
        actions={
          canManage ? (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-3 py-2 text-sm font-medium text-white hover:bg-sk-coral-dark"
            >
              <Plus className="h-4 w-4" /> New role
            </button>
          ) : null
        }
      />
      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading matrix…
          </div>
        ) : (
          <div className="sk-card overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-sk-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Permission</th>
                  {roles.map((r) => (
                    <th key={r.id} className="px-3 py-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        {r.is_system_role && <Lock className="h-3 w-3 text-muted-foreground" />}
                        <span>{r.label}</span>
                        {canManage && !r.is_system_role && (
                          <>
                            <button
                              onClick={() => setEditing(r)}
                              className="rounded p-0.5 hover:bg-muted"
                              title="Rename"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => onDelete(r)}
                              className="rounded p-0.5 hover:bg-muted"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </button>
                          </>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map(([module, perms]) => (
                  <>
                    <tr key={`h-${module}`} className="bg-sk-surface-muted/50">
                      <td
                        colSpan={roles.length + 1}
                        className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {module}
                      </td>
                    </tr>
                    {perms.map((p) => (
                      <tr key={p.code} className="border-t border-border">
                        <td className="px-4 py-2">
                          <div className="font-medium">{p.label}</div>
                          <div className="text-[11px] font-mono text-muted-foreground">{p.code}</div>
                        </td>
                        {roles.map((r) => {
                          const has = matrix.byCode[r.code]?.includes(p.code);
                          const editable = canManage && !r.is_system_role;
                          return (
                            <td key={r.id} className="px-3 py-2 text-center">
                              {editable ? (
                                <button
                                  onClick={() => onToggle(r, p.code)}
                                  className={
                                    "mx-auto flex h-5 w-5 items-center justify-center rounded border " +
                                    (has
                                      ? "border-green-600 bg-green-50 text-green-700 hover:bg-green-100"
                                      : "border-border text-transparent hover:border-sk-coral hover:text-sk-coral/40")
                                  }
                                  title={has ? "Click to remove" : "Click to grant"}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                              ) : has ? (
                                <Check className="mx-auto h-4 w-4 text-green-600" />
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <RoleEditor
          title="New role"
          initial={{ code: "", label: "", description: "" }}
          allowCodeEdit
          onClose={() => setCreating(false)}
          onSave={async ({ code, label, description }) => {
            try {
              await createRole.mutateAsync({ code, label, description });
              toast({ title: "Role created" });
              setCreating(false);
            } catch (e: any) {
              toast({ title: "Couldn't create role", description: e.message, variant: "destructive" });
            }
          }}
        />
      )}
      {editing && (
        <RoleEditor
          title={`Edit ${editing.label}`}
          initial={{ code: editing.code, label: editing.label, description: editing.description ?? "" }}
          allowCodeEdit={false}
          onClose={() => setEditing(null)}
          onSave={async ({ label, description }) => {
            try {
              await updateRole.mutateAsync({ id: editing.id, label, description });
              toast({ title: "Role updated" });
              setEditing(null);
            } catch (e: any) {
              toast({ title: "Couldn't update role", description: e.message, variant: "destructive" });
            }
          }}
        />
      )}
    </>
  );
}

function RoleEditor({
  title,
  initial,
  allowCodeEdit,
  onClose,
  onSave,
}: {
  title: string;
  initial: { code: string; label: string; description: string };
  allowCodeEdit: boolean;
  onClose: () => void;
  onSave: (v: { code: string; label: string; description: string }) => void | Promise<void>;
}) {
  const [code, setCode] = useState(initial.code);
  const [label, setLabel] = useState(initial.label);
  const [description, setDescription] = useState(initial.description);
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              placeholder="Groomer"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              disabled={!allowCodeEdit}
              className="w-full rounded-lg border border-border px-3 py-2 font-mono text-sm disabled:bg-muted"
              placeholder="groomer"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Lowercase, letters/numbers/underscore. Cannot be changed later.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={saving || !label.trim() || (allowCodeEdit && !code.trim())}
            onClick={async () => {
              setSaving(true);
              await onSave({ code: code.trim(), label: label.trim(), description: description.trim() });
              setSaving(false);
            }}
            className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-medium text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}