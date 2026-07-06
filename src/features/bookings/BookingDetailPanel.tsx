import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { X, Pencil, ExternalLink, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { StatusBadge } from "@/components/ui/status-badge";
import { useUpdateBookingStatus, type BookingListRow, type BookingStatus } from "./queries";
import { BookingFormModal } from "./BookingFormModal";

const STATUS_ACTIONS: { status: BookingStatus; label: string }[] = [
  { status: "confirmed", label: "Confirm" },
  { status: "checked_in", label: "Check in" },
  { status: "in_progress", label: "Start" },
  { status: "ready", label: "Ready" },
  { status: "checked_out", label: "Check out" },
  { status: "completed", label: "Complete" },
  { status: "cancelled", label: "Cancel" },
  { status: "no_show", label: "No show" },
];

interface Props {
  tenantId: string;
  booking: BookingListRow;
  onClose: () => void;
}

export function BookingDetailPanel({ tenantId, booking, onClose }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const updateStatus = useUpdateBookingStatus(tenantId);

  const start = booking.start_at ? new Date(booking.start_at) : null;
  const end = booking.end_at ? new Date(booking.end_at) : null;

  const warnings: string[] = [];
  if (!booking.resource_id) warnings.push("No resource assigned");
  if (!booking.customer?.mobile && !booking.customer?.email) warnings.push("Customer has no phone or email");

  async function setStatus(status: BookingStatus) {
    try {
      await updateStatus.mutateAsync({ id: booking.id, status });
      toast.success(`Status updated to ${status.replace(/_/g, " ")}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update status");
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {booking.booking_number}
            </div>
            <h2 className="mt-0.5 text-lg font-semibold">
              {booking.service_type.replace(/_/g, " ")}
            </h2>
            <div className="mt-2"><StatusBadge status={booking.status} /></div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
          {warnings.length > 0 && (
            <div className="rounded-lg border border-sk-orange bg-sk-orange-soft p-3 text-sk-orange">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                <AlertTriangle className="h-3.5 w-3.5" /> Warnings
              </div>
              <ul className="ml-4 list-disc space-y-0.5 text-xs">
                {warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}

          <section>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</div>
            <div className="mt-1">
              {start ? format(start, "EEE d MMM yyyy") : "—"}
            </div>
            <div className="text-muted-foreground">
              {start ? format(start, "HH:mm") : "—"} – {end ? format(end, "HH:mm") : "—"}
            </div>
          </section>

          <section>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resource</div>
            <div className="mt-1">{booking.resource?.name ?? <span className="text-muted-foreground">Unassigned</span>}</div>
          </section>

          <section>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</div>
            {booking.customer ? (
              <div className="mt-1">
                <Link to={`/admin/customers/${booking.customer.id}`} className="inline-flex items-center gap-1 font-medium hover:text-sk-coral-dark">
                  {booking.customer.full_name ?? "Unnamed"} <ExternalLink className="h-3.5 w-3.5" />
                </Link>
                <div className="text-xs text-muted-foreground">
                  {booking.customer.customer_number} · {booking.customer.mobile ?? booking.customer.email ?? "—"}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">—</div>
            )}
          </section>

          <section>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pets</div>
            {booking.booking_pets.length ? (
              <ul className="mt-1 space-y-1">
                {booking.booking_pets.map((bp, i) =>
                  bp.pet ? (
                    <li key={bp.pet.id ?? i}>
                      <Link to={`/admin/pets/${bp.pet.id}`} className="inline-flex items-center gap-1 hover:text-sk-coral-dark">
                        {bp.pet.name} <span className="text-xs text-muted-foreground">· {bp.pet.breed ?? bp.pet.species ?? ""}</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            ) : (
              <div className="mt-1 text-muted-foreground">No pets linked</div>
            )}
          </section>

          {booking.notes_internal && (
            <section>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal notes</div>
              <p className="mt-1 whitespace-pre-wrap">{booking.notes_internal}</p>
            </section>
          )}
          {booking.notes_customer && (
            <section>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer notes</div>
              <p className="mt-1 whitespace-pre-wrap">{booking.notes_customer}</p>
            </section>
          )}

          <section>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick status</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STATUS_ACTIONS.map((a) => (
                <button
                  key={a.status}
                  disabled={updateStatus.isPending || booking.status === a.status}
                  onClick={() => setStatus(a.status)}
                  className={
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                    (booking.status === a.status
                      ? "border-sk-coral bg-sk-coral text-white"
                      : "border-border bg-white text-foreground hover:bg-muted disabled:opacity-50")
                  }
                >
                  {a.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </aside>

      {editOpen && (
        <BookingFormModal
          tenantId={tenantId}
          booking={booking}
          onClose={() => setEditOpen(false)}
          onSaved={() => setEditOpen(false)}
        />
      )}
    </>
  );
}