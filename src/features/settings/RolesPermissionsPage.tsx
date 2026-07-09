import { useMemo } from "react";
import { Check, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import {
  useAssignableRoles,
  usePermissionsCatalog,
  useRolePermissionsMatrix,
} from "@/features/users/queries";

export default function RolesPermissionsPage() {
  const { currentTenant } = useCurrentUser();
  const tenantId = currentTenant?.id ?? "";
  const rolesQ = useAssignableRoles(tenantId);
  const permsQ = usePermissionsCatalog();
  const matrixQ = useRolePermissionsMatrix();

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
  const matrix = matrixQ.data ?? {};
  const roles = rolesQ.data ?? [];

  return (
    <>
      <AppHeader
        title="Roles & permissions"
        subtitle="What each staff role is allowed to do. Read-only for now."
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
                      {r.label}
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
                          const has = matrix[r.code]?.includes(p.code);
                          return (
                            <td key={r.id} className="px-3 py-2 text-center">
                              {has ? (
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
    </>
  );
}