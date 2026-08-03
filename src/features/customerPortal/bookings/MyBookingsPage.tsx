import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { useCurrentCustomer } from "../hooks";
import { SERVICE_LABEL, fmtDateTime, statusTone } from "../portalCommon";
import { BookingStayPlayBadge } from "@/features/daycare/StayPlayBadge";

export default function MyBookingsPage() {
  const cust = useCurrentCustomer();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const customerId = cust.data?.id ?? null;

  const q = useQuery({
    queryKey: ["portal_bookings", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_number, service_type, status, start_at, end_at, booking_pets(pet:pets(name))")
        .eq("customer_id", customerId!)
        .order("start_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const now = new Date().toISOString();
    return (q.data ?? []).filter((b: any) => (tab === "upcoming" ? (b.start_at ?? "") >= now : (b.start_at ?? "") < now));
  }, [q.data, tab]);

  return (
    <>
      <AppHeader
        title="My bookings"
        tabs={[
          { label: "Upcoming", active: tab === "upcoming", onClick: () => setTab("upcoming") },
          { label: "Past",     active: tab === "past",     onClick: () => setTab("past") },
        ]}
        actions={
          <Link to="/customer/bookings/new" className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            <CalendarPlus className="h-4 w-4" /> Request booking
          </Link>
        }
      />
      <div className="flex-1 p-6">
        {q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {q.data && rows.length === 0 && (
          <div className="sk-card p-10 text-center text-sm text-muted-foreground">No {tab} bookings.</div>
        )}
        {rows.length > 0 && (
          <div className="sk-card overflow-hidden">
            <ul className="divide-y divide-border">
              {rows.map((b: any) => {
                const petNames = (b.booking_pets ?? []).map((bp: any) => bp.pet?.name).filter(Boolean).join(", ");
                return (
                  <li key={b.id}>
                    <Link to={`/customer/bookings/${b.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-sk-surface-muted">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">{SERVICE_LABEL[b.service_type] ?? b.service_type} · {petNames || "—"}</div>
                        <div className="text-xs text-muted-foreground">{fmtDateTime(b.start_at)} · {b.booking_number}</div>
                        <BookingStayPlayBadge tenantId={null} bookingId={b.id} className="mt-1" />
                      </div>
                      <span className={"rounded-full px-2 py-0.5 text-[11px] font-medium " + statusTone(b.status)}>{b.status}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}