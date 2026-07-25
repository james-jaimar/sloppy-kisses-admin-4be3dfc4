import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, Inbox } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { useCurrentCustomer } from "../hooks";
import { SERVICE_LABEL, fmtDateTime, statusTone } from "../portalCommon";

const KIND_LABEL: Record<string, string> = { new: "New booking", change: "Change", cancel: "Cancellation" };

export default function MyRequestsPage() {
  const cust = useCurrentCustomer();
  const q = useQuery({
    queryKey: ["portal_requests", cust.data?.id],
    enabled: !!cust.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_requests")
        .select("id, service_type, kind, status, preferred_start_at, preferred_end_at, customer_notes, admin_notes, created_at, converted_booking_id, related_booking_id")
        .eq("customer_id", cust.data!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <AppHeader title="My requests" subtitle="Every booking request you've sent us" />
      <div className="flex-1 p-6">
        {q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {q.data && q.data.length === 0 && (
          <div className="sk-card grid place-items-center gap-3 p-10 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">No requests yet.</div>
            <Link to="/customer/bookings/new" className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark">
              Request a booking
            </Link>
          </div>
        )}
        {q.data && q.data.length > 0 && (
          <div className="sk-card overflow-hidden">
            <ul className="divide-y divide-border">
              {q.data.map((r: any) => (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold">{KIND_LABEL[r.kind] ?? r.kind} · {SERVICE_LABEL[r.service_type] ?? r.service_type}</span>
                    <span className={"rounded-full px-2 py-0.5 text-[11px] font-medium " + statusTone(r.status)}>{r.status.replace(/_/g, " ")}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</span>
                  </div>
                  {(r.preferred_start_at || r.preferred_end_at) && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Preferred: {fmtDateTime(r.preferred_start_at)}{r.preferred_end_at ? ` → ${fmtDateTime(r.preferred_end_at)}` : ""}
                    </div>
                  )}
                  {r.customer_notes && <div className="mt-2 text-sm">{r.customer_notes}</div>}
                  {r.admin_notes && (
                    <div className="mt-2 rounded-lg bg-sk-turquoise-soft px-3 py-2 text-sm text-sk-turquoise-dark">
                      <span className="font-semibold">Sloppy Kisses: </span>{r.admin_notes}
                    </div>
                  )}
                  {r.converted_booking_id && (
                    <div className="mt-2 text-xs">
                      <Link to={`/customer/bookings/${r.converted_booking_id}`} className="font-medium text-sk-coral-dark hover:underline">View confirmed booking →</Link>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}