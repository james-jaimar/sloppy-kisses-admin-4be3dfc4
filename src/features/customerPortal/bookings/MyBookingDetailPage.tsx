import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, X, Edit3 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { SERVICE_LABEL, fmtDateTime, statusTone } from "../portalCommon";
import { useCurrentCustomer } from "../hooks";
import { NewBookingRequestModal } from "./NewBookingRequestModal";

export default function MyBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const cust = useCurrentCustomer();
  const [action, setAction] = useState<"change" | "cancel" | null>(null);

  const q = useQuery({
    queryKey: ["portal_booking", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, tenant_id, booking_number, service_type, status, start_at, end_at, notes_customer, booking_pets(pet:pets(id, name)), resource:resources(name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (q.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!q.data) return <div className="p-6 text-sm text-muted-foreground">Booking not found.</div>;

  const b: any = q.data;
  const petNames = (b.booking_pets ?? []).map((bp: any) => bp.pet?.name).filter(Boolean).join(", ");
  const cancellable = !["cancelled", "completed", "checked_out", "no_show"].includes(b.status);

  return (
    <>
      <AppHeader title={`${SERVICE_LABEL[b.service_type] ?? b.service_type}`} subtitle={b.booking_number} />
      <div className="flex-1 space-y-6 p-6">
        <Link to="/customer/bookings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to bookings
        </Link>

        <div className="sk-card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + statusTone(b.status)}>{b.status}</span>
            {cancellable && cust.data && (
              <div className="flex gap-2">
                <button onClick={() => setAction("change")} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">
                  <Edit3 className="h-3.5 w-3.5" /> Request change
                </button>
                <button onClick={() => setAction("cancel")} className="inline-flex items-center gap-1 rounded-lg border border-sk-coral text-sk-coral-dark px-3 py-1.5 text-xs hover:bg-sk-coral-soft">
                  <X className="h-3.5 w-3.5" /> Cancel booking
                </button>
              </div>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Pet(s)" value={petNames} />
            <Field label="Resource" value={b.resource?.name ?? "—"} />
            <Field label="Start" value={fmtDateTime(b.start_at)} />
            <Field label="End" value={fmtDateTime(b.end_at)} />
            <Field label="Notes" value={b.notes_customer} full />
          </div>
        </div>
      </div>

      {action && cust.data && (
        <NewBookingRequestModal
          customerId={cust.data.id}
          tenantId={b.tenant_id}
          relatedBookingId={b.id}
          kind={action}
          onClose={() => setAction(null)}
        />
      )}
    </>
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