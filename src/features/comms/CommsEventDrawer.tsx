import { format } from "date-fns";
import { X, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useCancelNotification, useResendNotification, type NotificationEvent } from "./queries";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

interface Props {
  tenantId: string;
  event: NotificationEvent;
  onClose: () => void;
}

export function CommsEventDrawer({ tenantId, event, onClose }: Props) {
  const { hasPermission } = useCurrentUser();
  const canSend = hasPermission("comms.send");
  const resend = useResendNotification(tenantId);
  const cancel = useCancelNotification(tenantId);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{event.channel} · {event.event_type}</div>
            <div className="text-base font-semibold">{event.subject ?? "(no subject)"}</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5 text-sm">
          <Row label="Status">{event.status}{event.error ? ` — ${event.error}` : ""}</Row>
          <Row label="Recipient">{event.recipient_email ?? event.recipient_phone ?? event.customer?.email ?? "—"}</Row>
          <Row label="Created">{format(new Date(event.created_at), "d MMM yyyy HH:mm")}</Row>
          {event.sent_at && <Row label="Sent">{format(new Date(event.sent_at), "d MMM yyyy HH:mm")}</Row>}
          {event.template_key && <Row label="Template">{event.template_key}</Row>}
          {event.provider_message_id && <Row label="Provider msg id">{event.provider_message_id}</Row>}
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Body</div>
            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-xs">
{event.body_rendered ?? JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>

          {canSend && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <button
                disabled={resend.isPending || event.status === "pending"}
                onClick={async () => { try { await resend.mutateAsync(event.id); toast.success("Queued for resend"); onClose(); } catch (e: any) { toast.error(e?.message); } }}
                className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-3 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
                <Send className="h-4 w-4" /> Resend
              </button>
              {event.status === "pending" && (
                <button
                  disabled={cancel.isPending}
                  onClick={async () => { try { await cancel.mutateAsync(event.id); toast.success("Cancelled"); onClose(); } catch (e: any) { toast.error(e?.message); } }}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                  <XCircle className="h-4 w-4" /> Cancel send
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}