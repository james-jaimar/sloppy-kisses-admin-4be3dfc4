import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, MessageSquare } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { useCurrentCustomer } from "../hooks";
import { fmtDateTime } from "../portalCommon";

const EVENT_LABEL: Record<string, string> = {
  booking_created: "Booking requested",
  booking_confirmed: "Booking confirmed",
  booking_cancelled: "Booking cancelled",
  booking_reminder_24h: "Booking reminder",
  invoice_issued: "Invoice issued",
  invoice_sent: "Invoice sent",
  invoice_reminder: "Payment reminder",
  invoice_paid: "Payment received",
  payment_received: "Payment received",
};

export default function MyMessagesPage() {
  const cust = useCurrentCustomer();
  const q = useQuery({
    queryKey: ["portal_messages", cust.data?.id],
    enabled: !!cust.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_events")
        .select("id, event_type, channel, status, subject, body, created_at, sent_at, booking_id, invoice_id")
        .eq("customer_id", cust.data!.id)
        .in("status", ["sent", "queued", "pending", "delivered"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <AppHeader title="Messages" subtitle="Confirmations, reminders and receipts we've sent you" />
      <div className="flex-1 p-6">
        {q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {q.data && q.data.length === 0 && (
          <div className="sk-card grid place-items-center gap-3 p-10 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">No messages yet.</div>
          </div>
        )}
        {q.data && q.data.length > 0 && (
          <div className="space-y-3">
            {q.data.map((m: any) => (
              <div key={m.id} className="sk-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{EVENT_LABEL[m.event_type] ?? m.event_type}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground uppercase">{m.channel}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(m.sent_at ?? m.created_at)}</span>
                </div>
                {m.subject && <div className="mt-2 text-sm font-medium">{m.subject}</div>}
                {m.body && <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{m.body}</div>}
                <div className="mt-2 flex gap-3 text-xs">
                  {m.booking_id && <Link to={`/customer/bookings/${m.booking_id}`} className="font-medium text-sk-coral-dark hover:underline">View booking</Link>}
                  {m.invoice_id && <Link to={`/customer/invoices/${m.invoice_id}`} className="font-medium text-sk-coral-dark hover:underline">View invoice</Link>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}