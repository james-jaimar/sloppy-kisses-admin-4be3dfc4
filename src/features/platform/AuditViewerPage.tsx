import { AppHeader } from "@/components/layout/AppHeader";
import { usePlatformAudit } from "./queries";

export default function AuditViewerPage() {
  const { data, isLoading, error } = usePlatformAudit(500);
  return (
    <>
      <AppHeader title="Audit log" subtitle="Platform-owner actions (tenant switches, flag toggles, impersonation)." />
      <div className="flex-1 p-6">
        <div className="sk-card overflow-hidden">
          {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {error && <div className="p-6 text-sm text-sk-coral-dark">{(error as Error).message}</div>}
          {data && (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30 align-top">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.target ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{r.tenant_id ? r.tenant_id.slice(0, 8) : "—"}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{r.actor_profile_id ? r.actor_profile_id.slice(0, 8) : "—"}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      <pre className="max-w-md whitespace-pre-wrap">{r.payload ? JSON.stringify(r.payload, null, 0) : "—"}</pre>
                    </td>
                  </tr>
                ))}
                {!data.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No audit rows yet.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}