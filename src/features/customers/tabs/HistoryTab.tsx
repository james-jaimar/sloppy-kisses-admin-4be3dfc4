import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase/client";

type CommsItem = {
  kind: "comm";
  id: string;
  at: string;
  channel: string;
  event_type: string;
  status: string;
  subject: string | null;
  recipient: string | null;
  error: string | null;
};
type StatusItem = {
  kind: "status";
  id: string;
  at: string;
  booking_id: string;
  booking_number: string | null;
  from_status: string | null;
  to_status: string | null;
  event_kind: string | null;
  note: string | null;
};
type Item = CommsItem | StatusItem;

export function HistoryTab({ tenantId, customerId }: { tenantId: string; customerId: string }) {
  const commsQ = useQuery({
    queryKey: ["customer_comms", tenantId, customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_events")
        .select("id, created_at, channel, event_type, status, subject, recipient_email, recipient_phone, error")
        .eq("tenant_id", tenantId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const statusQ = useQuery({
    queryKey: ["customer_status_events", tenantId, customerId],
    queryFn: async () => {
      const { data: bookings, error: bErr } = await supabase
        .from("bookings")
        .select("id, booking_number")
        .eq("tenant_id", tenantId)
        .eq("customer_id", customerId)
        .limit(500);
      if (bErr) throw bErr;
      const ids = (bookings ?? []).map((b) => b.id);
      const numMap = new Map(bookings?.map((b) => [b.id, b.booking_number]) ?? []);
      if (!ids.length) return [] as any[];
      const { data, error } = await supabase
        .from("booking_status_events")
        .select("id, created_at, booking_id, from_status, to_status, event_kind, note")
        .eq("tenant_id", tenantId)
        .in("booking_id", ids)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).map((e: any) => ({ ...e, booking_number: numMap.get(e.booking_id) ?? null }));
    },
  });

  const items: Item[] = useMemo(() => {
    const c: Item[] = (commsQ.data ?? []).map((r: any) => ({
      kind: "comm",
      id: r.id,
      at: r.created_at,
      channel: r.channel,
      event_type: r.event_type,
      status: r.status,
      subject: r.subject,
      recipient: r.recipient_email ?? r.recipient_phone ?? null,
      error: r.error,
    }));
    const s: Item[] = (statusQ.data ?? []).map((r: any) => ({
      kind: "status",
      id: r.id,
      at: r.created_at,
      booking_id: r.booking_id,
      booking_number: r.booking_number,
      from_status: r.from_status,
      to_status: r.to_status,
      event_kind: r.event_kind,
      note: r.note,
    }));
    return [...c, ...s].sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [commsQ.data, statusQ.data]);

  const loading = commsQ.isLoading || statusQ.isLoading;
  if (loading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
      </div>
    );
  if (!items.length)
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <Clock className="h-5 w-5" /> No activity yet.
      </div>
    );

  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => (
        <li
          key={`${it.kind}-${it.id}`}
          className="flex items-start gap-3 rounded-xl border border-border bg-white p-3"
        >
          <div className="mt-0.5">
            {it.kind === "comm" ? (
              <CommIcon channel={it.channel} status={it.status} />
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            {it.kind === "comm" ? (
              <>
                <div className="text-sm font-medium">
                  {it.subject || it.event_type}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    · {it.channel} · {it.status}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {it.recipient ?? "—"} · {format(new Date(it.at), "dd MMM yyyy HH:mm")}
                </div>
                {it.error && <div className="mt-1 text-xs text-sk-coral-dark">{it.error}</div>}
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-sm">
                  <Link
                    to={`/admin/bookings/${it.booking_id}`}
                    className="font-medium text-sk-coral-dark hover:underline"
                  >
                    {it.booking_number ? `#${it.booking_number}` : "Booking"}
                  </Link>
                  <span className="text-muted-foreground">{it.from_status ?? "—"}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{it.to_status ?? it.event_kind ?? "updated"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(it.at), "dd MMM yyyy HH:mm")}
                  {it.note ? ` · ${it.note}` : ""}
                </div>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function CommIcon({ channel, status }: { channel: string; status: string }) {
  const cls =
    status === "sent" || status === "delivered"
      ? "text-emerald-600"
      : status === "failed"
        ? "text-sk-coral-dark"
        : "text-muted-foreground";
  if (channel === "sms" || channel === "whatsapp")
    return <MessageSquare className={`h-4 w-4 ${cls}`} />;
  if (channel === "voice") return <Phone className={`h-4 w-4 ${cls}`} />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-sk-coral-dark" />;
  if (status === "sent" || status === "delivered")
    return <CheckCircle2 className={`h-4 w-4 ${cls}`} />;
  return <Mail className={`h-4 w-4 ${cls}`} />;
}