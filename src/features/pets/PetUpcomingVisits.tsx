import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase/client";
import { BookingStatusChip } from "@/features/bookings/statusMeta";
import { useBookingPeekClick } from "@/features/bookings/BookingPeek";

const HIDDEN = ["cancelled", "no_show", "completed", "checked_out"];

/** Next visits for one pet across every service, so staff can answer "when is Milo in next?" from the pet profile. */
export function PetUpcomingVisits({ tenantId, petId }: { tenantId: string; petId: string }) {
  const peek = useBookingPeekClick();
  const q = useQuery({
    queryKey: ["bookings", "pet-upcoming", tenantId, petId],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("booking_pets")
        .select("booking:bookings!inner(id, booking_number, service_type, status, start_at, end_at, tenant_id)")
        .eq("pet_id", petId)
        .eq("booking.tenant_id", tenantId)
        .gte("booking.end_at", nowIso)
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as any[])
        .map((r) => r.booking)
        .filter((b) => b && !HIDDEN.includes(b.status))
        .sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)))
        .slice(0, 8);
    },
  });

  return (
    <div className="sk-card p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming visits</div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing booked.</p>
      ) : (
        <ul className="divide-y divide-border">
          {q.data!.map((b: any) => (
            <li key={b.id}>
              <Link to={`/admin/bookings/${b.id}`} onClick={peek(b.id)} className="flex items-center justify-between gap-2 py-2 text-sm hover:text-sk-coral-dark">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{b.start_at ? format(new Date(b.start_at), "dd MMM yyyy, HH:mm") : "—"}</span>
                  <span className="text-muted-foreground"> · {String(b.service_type).replace(/_/g, " ")} · {b.booking_number}</span>
                </span>
                <BookingStatusChip status={b.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
