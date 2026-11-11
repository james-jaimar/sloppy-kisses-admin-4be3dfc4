import { format } from "date-fns";
import { CheckCircle2, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useCancelNotification, useClearNotificationWarning, useResendNotification, type NotificationEvent } from "./queries";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modals/ModalShell";

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
  const clear = useClearNotificationWarning(tenantId);
  const busy = resend.isPending || cancel.isPending || clear.isPending;

  return (
    <ModalShell title={event.subject ?? "(no subject)"} subtitle={`${event.channel} · ${event.event_type}`} onClose={busy ? undefined : onClose} closeOnBackdrop>
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
              <Button
                disabled={busy || event.status === "pending"}
                onClick={async () => { try { await resend.mutateAsync(event.id); toast.success("Queued for resend"); onClose(); } catch (e: any) { toast.error(e?.message); } }}
                >
                <Send className="h-4 w-4" /> Resend
              </Button>
              {event.status === "failed" && (
                <Button variant="outline" disabled={busy}
                  onClick={async () => { try { await clear.mutateAsync(event.id); toast.success("Warning cleared; message retained in All"); onClose(); } catch (e: any) { toast.error(e?.message); } }}>
                  <CheckCircle2 className="h-4 w-4" /> {clear.isPending ? "Clearing…" : "Clear warning"}
                </Button>
              )}
              {event.status === "pending" && (
                <Button variant="outline"
                  disabled={busy}
                  onClick={async () => { try { await cancel.mutateAsync(event.id); toast.success("Cancelled"); onClose(); } catch (e: any) { toast.error(e?.message); } }}
                  >
                  <XCircle className="h-4 w-4" /> Cancel send
                </Button>
              )}
            </div>
          )}
        </div>
    </ModalShell>
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