import { AlertTriangle, Bell, Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useOpenOfficeNotes, useMarkDayNoteHandled } from "./dayNotesQueries";
import { useIncidents, useUpdateIncident } from "@/features/work/queries";

/**
 * Front-desk worklist: daycare notes flagged for the office plus open incidents.
 * Items drop off once handled but stay in history.
 */
export function NeedsAttentionPanel({
  tenantId,
  className = "",
}: {
  tenantId: string | null;
  className?: string;
}) {
  const { profile, hasPermission } = useCurrentUser();
  const notesQ = useOpenOfficeNotes(tenantId);
  const incidentsQ = useIncidents({ tenantId, states: ["open", "acknowledged"] });
  const markHandled = useMarkDayNoteHandled(tenantId ?? "");
  const updateIncident = useUpdateIncident(tenantId ?? "");
  const canResolve = hasPermission("incidents.acknowledge");

  const notes = notesQ.data ?? [];
  const incidents = incidentsQ.data ?? [];
  const total = notes.length + incidents.length;
  const loading = notesQ.isLoading || incidentsQ.isLoading;

  if (!tenantId) return null;

  return (
    <section className={`rounded-2xl border border-border bg-white p-4 ${className}`}>
      <header className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-sk-orange" />
        <h2 className="text-sm font-bold">Needs attention</h2>
        {total > 0 && (
          <span className="rounded-full bg-sk-orange-soft px-2 py-0.5 text-xs font-bold text-sk-orange">
            {total}
          </span>
        )}
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {!loading && total === 0 && (
        <p className="text-sm text-muted-foreground">Nothing outstanding — nice work.</p>
      )}

      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl border border-sk-orange/50 bg-sk-orange-soft/50 p-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{n.pet?.name ?? "Dog"}</span>
              {n.customer?.full_name && <span>· {n.customer.full_name}</span>}
              <span>· {n.author?.full_name ?? n.author?.email ?? "Staff"}</span>
              <span>· {format(new Date(n.created_at), "dd MMM HH:mm")}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
            <button
              onClick={async () => {
                try {
                  await markHandled.mutateAsync({ id: n.id, profileId: profile?.id ?? null });
                  toast.success("Marked handled");
                } catch (e: any) {
                  toast.error(e?.message ?? "Couldn't update the note");
                }
              }}
              className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold hover:bg-muted"
            >
              <Check className="h-3.5 w-3.5" /> Mark handled
            </button>
          </li>
        ))}

        {incidents.map((i) => (
          <li key={i.id} className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              <span className="font-semibold text-foreground">{i.pet?.name ?? "Incident"}</span>
              <span>· {i.category}</span>
              <span>· {i.severity}</span>
              <span>· {format(new Date(i.created_at), "dd MMM HH:mm")}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{i.description}</p>
            {canResolve && (
              <button
                onClick={async () => {
                  try {
                    await updateIncident.mutateAsync({ id: i.id, state: "resolved", profileId: profile?.id ?? null });
                    toast.success("Incident resolved");
                  } catch (e: any) {
                    toast.error(e?.message ?? "Couldn't update the incident");
                  }
                }}
                className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold hover:bg-muted"
              >
                <Check className="h-3.5 w-3.5" /> Mark handled
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
