import { format } from "date-fns";
import { MessageSquare } from "lucide-react";
import { useBookingNotifications } from "@/features/comms/queries";

export function BookingCommsPanel({ tenantId, bookingId }: { tenantId: string; bookingId: string }) {
  const q = useBookingNotifications(tenantId, bookingId);
  return (
    <div className="sk-card p-5">
      <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <MessageSquare className="h-4 w-4" /> Comms
      </div>
      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!q.isLoading && !q.data?.length && <div className="text-sm text-muted-foreground">No messages sent for this booking yet.</div>}
      {!!q.data?.length && (
        <ul className="space-y-2 text-sm">
          {q.data.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-0">
              <div>
                <div className="font-medium">{e.event_type}</div>
                <div className="text-xs text-muted-foreground">{format(new Date(e.created_at), "d MMM HH:mm")} · {e.channel}</div>
              </div>
              <div className="text-xs text-muted-foreground">{e.status}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}