import { Link } from "react-router-dom";
import { Scissors } from "lucide-react";
import { useBookingGroomRequests } from "./queries";

const LABEL: Record<string, string> = {
  pending: "Awaiting scheduling",
  scheduled: "Scheduled",
  declined: "Not possible this stay",
};

/** Read-only status of grooms the customer asked for during a hotel stay. */
export function PortalGroomRequestStatus({ bookingId }: { bookingId: string }) {
  const q = useBookingGroomRequests(bookingId);
  const rows = (q.data ?? []).filter((r) => r.status !== "cancelled");
  if (!rows.length) return null;

  return (
    <div className="sk-card space-y-3 p-6">
      <div className="flex items-center gap-2">
        <Scissors className="h-4 w-4 text-sk-coral-dark" />
        <h3 className="text-sm font-semibold">Grooming during this stay</h3>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-sk-surface-muted px-3 py-2 text-sm"
          >
            <span className="font-medium">{r.pet_name ?? "Pet"}</span>
            <span className="text-xs text-muted-foreground">
              {LABEL[r.status] ?? r.status}
              {r.status === "declined" && r.decline_reason ? ` — ${r.decline_reason}` : ""}
            </span>
            {r.status === "scheduled" && r.grooming_booking_id && (
              <Link
                to={`/customer/bookings/${r.grooming_booking_id}`}
                className="text-xs font-semibold text-sk-coral-dark hover:underline"
              >
                View groom
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
