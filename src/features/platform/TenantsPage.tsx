import { AppHeader } from "@/components/layout/AppHeader";
import { useAllTenants } from "./queries";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { Building2, ExternalLink } from "lucide-react";

export default function TenantsPage() {
  const { data, isLoading, error } = useAllTenants();
  const { currentTenant, setCurrentTenantId } = useCurrentUser();

  return (
    <>
      <AppHeader title="Tenants" subtitle="Every tenant on the platform. Switch context to inspect one via the normal admin UI." />
      <div className="flex-1 p-6">
        <div className="sk-card overflow-hidden">
          {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {error && <div className="p-6 text-sm text-sk-coral-dark">{(error as Error).message}</div>}
          {data && (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Timezone</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((t) => {
                  const isCurrent = currentTenant?.id === t.id;
                  return (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-medium">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {t.name}
                          {isCurrent && <span className="ml-2 rounded-full bg-sk-turquoise-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sk-turquoise-dark">Current</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.slug}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.timezone ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setCurrentTenantId(t.id);
                            window.location.href = "/admin/dashboard";
                          }}
                          disabled={isCurrent}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Enter admin
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!data.length && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No tenants.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}