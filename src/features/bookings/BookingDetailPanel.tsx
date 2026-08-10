import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { X, Pencil, ExternalLink, AlertTriangle, Mail } from "lucide-react";
import { Repeat } from "lucide-react";
import { format } from "date-fns";
import { useUpdateBookingStatus, useBookingNotifications, type BookingListRow, type BookingStatus } from "./queries";
import { BookingFormModal } from "./BookingFormModal";
import { BookingStatusChip } from "./statusMeta";
import { useBookingServiceDetails } from "./detailsQueries";
import { useCancelSeriesForward } from "./recurringQueries";
import { CancelBookingDialog } from "./CancelBookingDialog";
import { LateCollectionDialog } from "./LateCollectionDialog";
import { FailedCollectionDialog } from "./FailedCollectionDialog";
import { EarlyCheckoutDialog } from "./EarlyCheckoutDialog";
import { ExtraFoodDialog } from "./ExtraFoodDialog";
import { ArrivalHealthGate } from "./ArrivalHealthGate";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useBookingInstructions, useInstructionCatalog } from "@/features/grooming/instructions/queries";
import { BookingStayPlayBadge, StayPlaySection } from "@/features/daycare/StayPlayBadge";
import { AccommodationFormCard } from "@/features/hotelForm/AccommodationFormCard";

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
  const [cancelOpen, setCancelOpen] = useState(false);
  const [lateOpen, setLateOpen] = useState(false);
  const [failedOpen, setFailedOpen] = useState(false);
  const [earlyOpen, setEarlyOpen] = useState(false);
  const [foodOpen, setFoodOpen] = useState(false);
  const confirm = useConfirm();
  const updateStatus = useUpdateBookingStatus(tenantId);
  const cancelSeries = useCancelSeriesForward(tenantId);
  const notificationsQ = useBookingNotifications(booking.id, tenantId);
  const detailsQ = useBookingServiceDetails(booking.id, booking.service_type, tenantId);
  const isGrooming = booking.service_type === "grooming_inhouse" || booking.service_type === "grooming_mobile";
  const instrQ = useBookingInstructions(isGrooming ? booking.id : null);
  const catalogQ = useInstructionCatalog(isGrooming ? tenantId : null);

  const start = booking.start_at ? new Date(booking.start_at) : null;
  const end = booking.end_at ? new Date(booking.end_at) : null;

  const warnings: string[] = [];
  if (!booking.resource_id) warnings.push("No resource assigned");
  if (!booking.customer?.mobile && !booking.customer?.email) warnings.push("Customer has no phone or email");

  async function setStatus(status: BookingStatus) {
    if (status === "cancelled") {
      setCancelOpen(true);
      return;
    }
    try {
      await updateStatus.mutateAsync({ id: booking.id, status });
      toast.success(`Status updated to ${status.replace(/_/g, " ")}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update status");
    }
  }

  async function cancelThisAndFuture() {
    const ok = await confirm({
      title: "Cancel this and all future bookings?",
      description: "The recurring rule will be deactivated too.",
      confirmLabel: "Cancel series",
      tone: "destructive",
    });
    if (!ok) return;
    try {
      await cancelSeries.mutateAsync({ bookingId: booking.id });
      toast.success("Series cancelled from this date forward");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to cancel series");
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <BookingStatusChip status={booking.status} />
              <BookingStayPlayBadge tenantId={tenantId} bookingId={booking.id} />
            </div>
            {(booking as any).recurring_rule_id && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-sk-turquoise-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sk-turquoise-dark">
                <Repeat className="h-3 w-3" /> Part of a series
              </div>
            )}
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

          <StayPlaySection tenantId={tenantId} bookingId={booking.id} />

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

          <ArrivalHealthGate
            bookingId={booking.id}
            pets={booking.booking_pets
              .map((bp) => bp.pet)
              .filter(Boolean)
              .map((p: any) => ({ id: p.id, name: p.name }))}
            onDate={booking.start_at ? String(booking.start_at).slice(0, 10) : undefined}
          />

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

          {detailsQ.data && detailsQ.data.kind !== "none" && detailsQ.data.data && (
            <section>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {detailsQ.data.kind === "grooming"
                  ? "Grooming details"
                  : detailsQ.data.kind === "hotel"
                    ? "Stay details"
                    : "Transport details"}
              </div>
              <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                {Object.entries(detailsQ.data.data)
                  .filter(([k, v]) =>
                    !["id", "tenant_id", "booking_id", "created_at", "updated_at"].includes(k) &&
                    v !== null && v !== "" && v !== false,
                  )
                  .map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                      <dd className="whitespace-pre-wrap">{String(v)}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          )}

          {String(booking.service_type).startsWith("hotel") && (
            <AccommodationFormCard bookingId={booking.id} />
          )}

          {isGrooming && instrQ.data && catalogQ.data && (
            <section>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Grooming instructions
              </div>
              <InstructionsSummary
                selections={instrQ.data.selections ?? {}}
                medicalFlags={instrQ.data.medical_flags ?? []}
                notes={instrQ.data.notes}
                toldOfficeToCall={instrQ.data.told_office_to_call}
                groups={catalogQ.data.groups}
                byGroup={catalogQ.data.byGroup}
              />
            </section>
          )}

          <section>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Mail className="h-3.5 w-3.5" /> Notifications
            </div>
            {notificationsQ.isLoading ? (
              <div className="mt-1 text-xs text-muted-foreground">Loading…</div>
            ) : (notificationsQ.data ?? []).length === 0 ? (
              <div className="mt-1 text-xs text-muted-foreground">No notifications queued yet.</div>
            ) : (
              <ul className="mt-1 space-y-1 text-xs">
                {notificationsQ.data!.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{n.event_type.replace(/_/g, " ")}</span>
                    <span
                      className={
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                        (n.status === "sent"    ? "bg-sk-green-soft text-sk-green" :
                         n.status === "pending" ? "bg-sk-turquoise-soft text-sk-turquoise-dark" :
                         n.status === "skipped" ? "bg-muted text-muted-foreground" :
                                                  "bg-destructive/10 text-destructive")
                      }
                      title={n.error ?? undefined}
                    >
                      {n.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Emails send once SMTP is configured. Customer must have an email and opt-in.
            </p>
          </section>

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
            {["daycare", "daycare_assessment", "hotel_dog", "hotel_cat"].includes(booking.service_type) && (
              <button
                onClick={() => setLateOpen(true)}
                className="mt-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                Late collection…
              </button>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {booking.service_type === "pickup_dropoff" && (
                <button
                  onClick={() => setFailedOpen(true)}
                  className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                >
                  Failed collection…
                </button>
              )}
              {String(booking.service_type).startsWith("hotel") && (
                <>
                  <button
                    onClick={() => setEarlyOpen(true)}
                    className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                  >
                    Early check-out…
                  </button>
                  <button
                    onClick={() => setFoodOpen(true)}
                    className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium hover:bg-muted"
                  >
                    Charge extra food…
                  </button>
                </>
              )}
            </div>
          </section>

          {(booking as any).recurring_rule_id && (
            <section>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Series actions</div>
              <button
                onClick={cancelThisAndFuture}
                disabled={cancelSeries.isPending}
                className="mt-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
              >
                Cancel this and all future bookings
              </button>
            </section>
          )}
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

      {cancelOpen && (
        <CancelBookingDialog
          tenantId={tenantId}
          bookingId={booking.id}
          bookingNumber={booking.booking_number}
          onClose={() => setCancelOpen(false)}
          onCancelled={onClose}
        />
      )}
      {lateOpen && (
        <LateCollectionDialog
          bookingId={booking.id}
          bookingNumber={booking.booking_number}
          onClose={() => setLateOpen(false)}
        />
      )}
      {failedOpen && (
        <FailedCollectionDialog
          bookingId={booking.id}
          bookingNumber={booking.booking_number}
          onClose={() => setFailedOpen(false)}
        />
      )}
      {earlyOpen && (
        <EarlyCheckoutDialog
          bookingId={booking.id}
          bookingNumber={booking.booking_number}
          onClose={() => setEarlyOpen(false)}
        />
      )}
      {foodOpen && (
        <ExtraFoodDialog
          bookingId={booking.id}
          bookingNumber={booking.booking_number}
          onClose={() => setFoodOpen(false)}
        />
      )}
    </>
  );
}

function InstructionsSummary({
  selections, medicalFlags, notes, toldOfficeToCall, groups, byGroup,
}: {
  selections: Record<string, any>;
  medicalFlags: string[];
  notes: string | null;
  toldOfficeToCall: string | null;
  groups: { id: string; code: string; label: string; kind: string; is_medical: boolean }[];
  byGroup: Record<string, { id: string; code: string; label: string; is_alert: boolean }[]>;
}) {
  const rows: { label: string; values: { text: string; alert: boolean }[] }[] = [];
  for (const g of groups) {
    if (g.is_medical) continue;
    const val = selections[g.code];
    if (val == null || val === "" || val === false) continue;
    const opts = byGroup[g.id] ?? [];
    let values: { text: string; alert: boolean }[] = [];
    if (g.kind === "single" && typeof val === "string") {
      const o = opts.find((x) => x.code === val);
      if (o) values = [{ text: o.label, alert: o.is_alert }];
    } else if (g.kind === "multi" && Array.isArray(val)) {
      values = val
        .map((c) => opts.find((x) => x.code === c))
        .filter(Boolean)
        .map((o) => ({ text: (o as any).label, alert: (o as any).is_alert }));
    } else if (g.kind === "bool" && val === true) {
      values = [{ text: "Yes", alert: false }];
    } else if ((g.kind === "text" || g.kind === "number") && val !== "") {
      values = [{ text: String(val), alert: false }];
    }
    if (values.length) rows.push({ label: g.label, values });
  }
  const alerts = new Set(medicalFlags);
  const medGroup = groups.find((g) => g.is_medical);
  const medOpts = medGroup ? (byGroup[medGroup.id] ?? []) : [];
  const medChips = medOpts.filter((o) => alerts.has(o.code));

  if (rows.length === 0 && medChips.length === 0 && !notes && !toldOfficeToCall) {
    return <div className="mt-1 text-xs text-muted-foreground">No instructions recorded.</div>;
  }

  return (
    <div className="mt-1 space-y-2 text-xs">
      {medChips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {medChips.map((m) => (
            <span key={m.code} className="rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">
              ⚠ {m.label}
            </span>
          ))}
        </div>
      )}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="flex flex-wrap gap-1">
              {r.values.map((v, i) => (
                <span key={i} className={"rounded px-1.5 py-0.5 " + (v.alert ? "bg-sk-orange-soft text-sk-orange" : "bg-muted")}>
                  {v.text}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {notes && (
        <div>
          <div className="text-muted-foreground">Notes</div>
          <div className="whitespace-pre-wrap">{notes}</div>
        </div>
      )}
      {toldOfficeToCall && (
        <div>
          <div className="text-muted-foreground">Told office to call</div>
          <div>{toldOfficeToCall}</div>
        </div>
      )}
    </div>
  );
}