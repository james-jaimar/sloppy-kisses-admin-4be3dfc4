import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, X, Edit3, FileText, CheckCircle2, CalendarPlus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { SERVICE_LABEL, fmtDateTime, statusTone } from "../portalCommon";
import { BookingStayPlayBadge, StayPlaySection } from "@/features/daycare/StayPlayBadge";
import { useCurrentCustomer } from "../hooks";
import { BookingChangeModal } from "./BookingChangeModal";
import { useMinLeadHours } from "./new/useBookingSubmit";
import { useAccommodationForm } from "@/features/hotelForm/accommodationForm";
import { PortalGroomRequestStatus } from "@/features/hotelGrooming/PortalGroomRequestStatus";
import { HotelMoneyStrip } from "@/features/hotelCattery/HotelMoneyStrip";

export default function MyBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const cust = useCurrentCustomer();
  const [action, setAction] = useState<"reschedule" | "cancel" | null>(null);

  const q = useQuery({
    queryKey: ["portal_booking", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, tenant_id, booking_number, service_type, status, start_at, end_at, notes_customer, booking_pets(pet:pets(id, name)), invoice:invoices!bookings_invoice_id_fkey(id, invoice_number, total, balance_due, status)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (q.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!q.data) return <div className="p-6 text-sm text-muted-foreground">Booking not found.</div>;

  const b: any = q.data;
  const group: "grooming" | "hotel" | "transport" =
    String(b.service_type).startsWith("hotel")
      ? "hotel"
      : String(b.service_type).startsWith("grooming")
        ? "grooming"
        : "transport";
  const petNames = (b.booking_pets ?? []).map((bp: any) => bp.pet?.name).filter(Boolean).join(", ");
  const cancellable = !["cancelled", "completed", "checked_out", "no_show"].includes(b.status);
  const inv = b.invoice ?? null;

  return (
    <>
      <AppHeader
        title={`${SERVICE_LABEL[b.service_type] ?? b.service_type}`}
        subtitle={b.booking_number}
        actions={
          <Link to="/customer/bookings/new" className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            <CalendarPlus className="h-4 w-4" /> Book another
          </Link>
        }
      />
      <div className="flex-1 space-y-6 p-6">
        <Link to="/customer/bookings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to bookings
        </Link>

        {group === "hotel" && <AccommodationFormBanner bookingId={b.id} />}
        {group === "hotel" && <PortalGroomRequestStatus bookingId={b.id} />}

        <div className="sk-card space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + statusTone(b.status)}>{b.status}</span>
              <BookingStayPlayBadge tenantId={b.tenant_id} bookingId={b.id} size="sm" />
            </div>
            {cancellable && cust.data && (
              <div className="flex gap-2">
                <button onClick={() => setAction("reschedule")} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">
                  <Edit3 className="h-3.5 w-3.5" /> Move booking
                </button>
                <button onClick={() => setAction("cancel")} className="inline-flex items-center gap-1 rounded-lg border border-sk-coral text-sk-coral-dark px-3 py-1.5 text-xs hover:bg-sk-coral-soft">
                  <X className="h-3.5 w-3.5" /> Cancel booking
                </button>
              </div>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Pet(s)" value={petNames} />
            <Field label="Start" value={fmtDateTime(b.start_at)} />
            <Field label="End" value={fmtDateTime(b.end_at)} />
            <Field label="Notes" value={b.notes_customer} full />
          </div>
          <StayPlaySection tenantId={b.tenant_id} bookingId={b.id} />
          {group === "hotel" && <HotelMoneyStrip bookingId={b.id} mode="portal" />}
          {inv && group !== "hotel" && (
            <div className="rounded-xl border border-border bg-sk-surface-muted p-4">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Invoice</div>
              <div className="mt-1 flex items-center justify-between">
                <Link to={`/customer/invoices/${inv.id}`} className="text-sm font-semibold text-sk-coral-dark hover:underline">
                  {inv.invoice_number}
                </Link>
                <div className="text-sm">
                  Total <span className="font-semibold">R {Number(inv.total ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</span>
                  {" · "}
                  Balance <span className="font-semibold text-sk-coral-dark">R {Number(inv.balance_due ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {action && cust.data && (
        <BookingChangeModalWrapper
          kind={action}
          booking={b}
          group={group}
          tenantId={b.tenant_id}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}

function BookingChangeModalWrapper({
  kind, booking, group, tenantId, onClose,
}: {
  kind: "reschedule" | "cancel";
  booking: any;
  group: "grooming" | "hotel" | "transport";
  tenantId: string;
  onClose: () => void;
}) {
  const lead = useMinLeadHours(tenantId, group);
  return (
    <BookingChangeModal
      kind={kind}
      bookingId={booking.id}
      startAt={booking.start_at}
      endAt={booking.end_at}
      noticeHours={lead.data ?? 24}
      onClose={onClose}
    />
  );
}

function Field({ label, value, full }: { label: string; value: string | null | undefined; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value || "—"}</div>
    </div>
  );
}

function AccommodationFormBanner({ bookingId }: { bookingId: string }) {
  const q = useAccommodationForm(bookingId);
  if (q.isLoading) return null;
  const received = Boolean(q.data?.receivedAt);
  return (
    <div className={"flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm " + (received ? "border-sk-green/30 bg-sk-green-soft text-sk-green" : "border-sk-orange/30 bg-sk-orange-soft text-sk-orange")}>
      <div className="flex items-center gap-2">
        {received ? <CheckCircle2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        {received ? "Accommodation form received — thank you." : "Please complete the accommodation form before your stay."}
      </div>
      <Link to={`/customer/bookings/${bookingId}/form`} className="rounded-lg border border-current px-3 py-1.5 text-xs font-semibold hover:bg-background/40">
        {received ? "View / update form" : "Complete form"}
      </Link>
    </div>
  );
}
