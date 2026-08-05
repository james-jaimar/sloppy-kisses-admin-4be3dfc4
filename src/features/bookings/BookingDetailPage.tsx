import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Pencil, CalendarDays, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useBookingDetail, useDeleteBooking } from "./queries";
import { BookingStatusChip } from "./statusMeta";
import { BookingFormModal } from "./BookingFormModal";
import { useTransportLegExistsForBooking } from "@/features/transport/queries";
import { Truck } from "lucide-react";
import { BookingInvoicePanel } from "./BookingInvoicePanel";
import { BookingCommsPanel } from "./BookingCommsPanel";
import { PinnedNotesBanner } from "@/features/customers/PinnedNotesBanner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { HotelVaxGatePanel } from "./HotelVaxGatePanel";
import { GroomingVaxGatePanel } from "./GroomingVaxGatePanel";
import { PhotoGatePanel } from "./PhotoGatePanel";
import { BookingStayPlayBadge, StayPlaySection } from "@/features/daycare/StayPlayBadge";

const SERVICE_LABELS: Record<string, string> = {
  daycare: "Daycare",
  daycare_assessment: "Daycare assessment",
  hotel_dog: "Hotel — dog",
  hotel_cat: "Hotel — cat",
  grooming_inhouse: "Grooming (in-house)",
  grooming_mobile: "Grooming (mobile)",
  pickup_dropoff: "Pick up / drop-off",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "EEE d MMM yyyy · HH:mm");
  } catch {
    return iso;
  }
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? "/admin/bookings";
  const [editOpen, setEditOpen] = useState(false);
  const confirm = useConfirm();

  const detailQ = useBookingDetail(id, tenantId);
  const b = detailQ.data;
  const del = useDeleteBooking();

  const bookingDate = b?.start_at ? b.start_at.slice(0, 10) : null;
  const needsTransportHint = Boolean(
    b && b.requires_transport && b.service_type !== "pickup_dropoff",
  );
  const legExistsQ = useTransportLegExistsForBooking({
    tenantId,
    customerId: b?.customer_id ?? null,
    isoDate: bookingDate,
    enabled: needsTransportHint,
  });
  const showAddTransportHint = needsTransportHint && legExistsQ.data === false;

  return (
    <>
      <AppHeader
        title={b ? `Booking ${b.booking_number}` : "Booking"}
        subtitle={b ? SERVICE_LABELS[b.service_type] ?? b.service_type : "Loading…"}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if ((location.state as { from?: string } | null)?.from) navigate(-1);
                else navigate(backTo);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            {b && (
              <button
                onClick={() => setEditOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark"
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
            {b && (
              <button
                onClick={async () => {
                  if (!(await confirm({ title: `Delete booking ${b.booking_number}?`, description: "Any auto-created invoice lines will be removed (only possible while the invoice is unsent).", confirmLabel: "Delete", tone: "destructive" }))) return;
                  try {
                    await del.mutateAsync(b.id);
                    toast.success("Booking deleted");
                    navigate(backTo);
                  } catch (err: any) {
                    toast.error(err?.message ?? "Failed to delete");
                  }
                }}
                disabled={del.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium text-sk-coral-dark hover:bg-sk-coral-soft disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
        }
      />
      <div className="flex-1 p-6">
        {detailQ.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading booking…
          </div>
        ) : detailQ.isError ? (
          <div className="sk-card p-6 text-sm text-sk-coral-dark">
            Failed to load booking: {(detailQ.error as any)?.message ?? "Unknown error"}
          </div>
        ) : !b ? (
          <div className="sk-card p-6 text-sm text-muted-foreground">Booking not found.</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-6">
              <PinnedNotesBanner customerId={b.customer_id} tenantId={tenantId} />
              {tenantId && (b.service_type === "hotel_dog" || b.service_type === "hotel_cat") && (
                <HotelVaxGatePanel tenantId={tenantId} bookingId={b.id} />
              )}
              {tenantId && (b.service_type === "grooming_inhouse" || b.service_type === "grooming_mobile") && (
                <GroomingVaxGatePanel tenantId={tenantId} bookingId={b.id} />
              )}
              {tenantId && (
                <PhotoGatePanel tenantId={tenantId} bookingId={b.id} serviceType={b.service_type} />
              )}
              <div className="sk-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {b.booking_number}
                    </div>
                    <h2 className="mt-0.5 text-xl font-semibold">
                      {SERVICE_LABELS[b.service_type] ?? b.service_type}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <BookingStatusChip status={b.status} />
                      <BookingStayPlayBadge tenantId={tenantId} bookingId={b.id} />
                    </div>
                  </div>
                  <Link
                    to="/admin/calendar"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-xs font-medium hover:bg-muted"
                  >
                    <CalendarDays className="h-4 w-4" /> Open calendar
                  </Link>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Start">{fmt(b.start_at)}</Field>
                  <Field label="End">{fmt(b.end_at)}</Field>
                  <Field label="Resource">
                    {b.resource?.name ?? <span className="text-muted-foreground">Unassigned</span>}
                  </Field>
                  <Field label="Created">{fmt(b.created_at)}</Field>
                  <Field label="Updated">{fmt(b.updated_at)}</Field>
                </div>
              </div>

              {(b.notes_internal || b.notes_customer) && (
                <div className="sk-card p-5 space-y-4">
                  {b.notes_internal && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal notes</div>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{b.notes_internal}</p>
                    </div>
                  )}
                  {b.notes_customer && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer notes</div>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{b.notes_customer}</p>
                    </div>
                  )}
                </div>
              )}

              {showAddTransportHint && (
                <div className="sk-card flex items-start gap-3 border-sk-orange bg-sk-orange-soft p-4 text-sm text-sk-orange">
                  <Truck className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold">Transport required — no leg scheduled</div>
                    <div className="text-xs opacity-90">
                      This booking is flagged as needing transport but no pick-up / drop-off leg exists for {bookingDate}.
                    </div>
                  </div>
                  <Link
                    to="/admin/pickup-dropoff"
                    className="inline-flex h-8 items-center rounded-md bg-white px-3 text-xs font-semibold text-sk-orange hover:bg-white/80"
                  >
                    Open transport board
                  </Link>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="sk-card p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</div>
                {b.customer ? (
                  <div className="mt-2 text-sm">
                    <Link
                      to={`/admin/customers/${b.customer.id}`}
                      className="inline-flex items-center gap-1 font-medium hover:text-sk-coral-dark"
                    >
                      {b.customer.full_name ?? "Unnamed"}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {b.customer.customer_number} · {b.customer.mobile ?? b.customer.email ?? "—"}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-muted-foreground">—</div>
                )}
              </div>

              <div className="sk-card p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pets</div>
                {b.booking_pets.length ? (
                  <ul className="mt-2 space-y-2 text-sm">
                    {b.booking_pets.map((bp, i) =>
                      bp.pet ? (
                        <li key={bp.pet.id ?? i}>
                          <Link
                            to={`/admin/pets/${bp.pet.id}`}
                            className="inline-flex items-center gap-1 font-medium hover:text-sk-coral-dark"
                          >
                            {bp.pet.name}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {bp.pet.pet_number} · {bp.pet.breed ?? bp.pet.species ?? "—"}
                          </div>
                        </li>
                      ) : null,
                    )}
                  </ul>
                ) : (
                  <div className="mt-1 text-sm text-muted-foreground">No pets linked</div>
                )}
              </div>

              <StayPlaySection tenantId={tenantId} bookingId={b.id} />

              {tenantId && (
                <BookingInvoicePanel tenantId={tenantId} bookingId={b.id} customerId={b.customer_id} />
              )}
              {tenantId && (
                <BookingCommsPanel tenantId={tenantId} bookingId={b.id} />
              )}
            </div>
          </div>
        )}
      </div>

      {editOpen && b && tenantId && (
        <BookingFormModal
          tenantId={tenantId}
          booking={b}
          onClose={() => setEditOpen(false)}
          onSaved={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}