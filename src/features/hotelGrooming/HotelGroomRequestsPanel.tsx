import { useState } from "react";
import { Link } from "react-router-dom";
import { Scissors, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  useBookingGroomRequests,
  useDeclineHotelGroom,
  type HotelGroomRequest,
} from "./queries";
import { ScheduleHotelGroomDialog } from "./ScheduleHotelGroomDialog";

/** Staff panel on a hotel booking: grooms the customer asked for during the stay. */
export function HotelGroomRequestsPanel({
  tenantId,
  bookingId,
}: {
  tenantId: string | null;
  bookingId: string;
}) {
  const q = useBookingGroomRequests(bookingId);
  const decline = useDeclineHotelGroom();
  const confirm = useConfirm();
  const [active, setActive] = useState<HotelGroomRequest | null>(null);

  const rows = q.data ?? [];
  const visible = rows.filter((r) => r.status !== "cancelled");
  if (q.isLoading) {
    return (
      <div className="sk-card flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking grooming requests…
      </div>
    );
  }
  if (!visible.length) return null;

  const pending = visible.filter((r) => r.status === "pending").length;

  return (
    <div
      className={
        "sk-card p-5 " + (pending ? "border-sk-orange bg-sk-orange-soft/40" : "")
      }
    >
      <div className="flex items-center gap-2">
        <Scissors className="h-4 w-4 text-sk-coral-dark" />
        <h3 className="text-sm font-semibold">
          Grooming requested during this stay
        </h3>
        {pending > 0 && (
          <span className="rounded-full bg-sk-orange px-2 py-0.5 text-[11px] font-semibold text-white">
            {pending} to schedule
          </span>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {visible.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-white p-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{r.pet_name ?? "Pet"}</div>
              {r.customer_notes && (
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                  {r.customer_notes}
                </p>
              )}
              {r.status === "declined" && r.decline_reason && (
                <p className="mt-0.5 text-xs text-sk-coral-dark">
                  Declined — {r.decline_reason}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {r.status === "scheduled" && r.grooming_booking_id ? (
                <Link
                  to={`/admin/bookings/${r.grooming_booking_id}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-xs font-medium hover:bg-muted"
                >
                  <CheckCircle2 className="h-4 w-4 text-sk-green" /> View groom
                </Link>
              ) : r.status === "pending" ? (
                <>
                  <button
                    onClick={() => setActive(r)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-sk-coral px-3 text-xs font-semibold text-white hover:bg-sk-coral-dark"
                  >
                    <Scissors className="h-4 w-4" /> Schedule
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        !(await confirm({
                          title: `Decline groom for ${r.pet_name ?? "this pet"}?`,
                          description:
                            "The request stays on record so the customer can see it was reviewed.",
                          confirmLabel: "Decline",
                          tone: "destructive",
                        }))
                      )
                        return;
                      try {
                        await decline.mutateAsync({
                          requestId: r.id,
                          reason: "No slot available during the stay",
                        });
                        toast.success("Request declined");
                      } catch (err: any) {
                        toast.error(err?.message ?? "Failed to decline");
                      }
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-xs font-medium text-sk-coral-dark hover:bg-sk-coral-soft"
                  >
                    <XCircle className="h-4 w-4" /> Decline
                  </button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Declined</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {active && (
        <ScheduleHotelGroomDialog
          tenantId={tenantId}
          request={active}
          open
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
