import { AppHeader } from "@/components/layout/AppHeader";
import { useNotificationEventsRecent } from "./queries";

export default function ActivityPage() {
  const { data, isLoading, error } = useNotificationEventsRecent(200);
  return (
    <>
      <AppHeader title="Activity & events" subtitle="Recent notification_events across all tenants." />
      <div className="flex-1 p-6">
        <div className="sk-card overflow-hidden">
          {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {error && <div className="p-6 text-sm text-sk-coral-dark">{(error as Error).message}</div>}
          {data && (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/30 align-top">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.event_type}</td>
                    <td className="px-4 py-3">
                      <span className={
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider " +
                        (r.status === "sent" ? "bg-sk-turquoise-soft text-sk-turquoise-dark" :
                         r.status === "failed" ? "bg-sk-coral-soft text-sk-coral-dark" :
                         "bg-muted text-muted-foreground")
                      }>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{r.tenant_id ? r.tenant_id.slice(0, 8) : "—"}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      <pre className="max-w-md whitespace-pre-wrap">{r.payload ? JSON.stringify(r.payload) : "—"}</pre>
                    </td>
                  </tr>
                ))}
                {!data.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No events yet.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}