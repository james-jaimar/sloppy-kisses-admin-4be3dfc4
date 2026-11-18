import { BookingPaymentSummary } from "@/features/shared/payments/BookingPaymentSummary";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDeskBookingInvoices } from "@/features/shared/payments/deskInvoiceQueries";
import { Receipt, Plus, AlertTriangle } from "lucide-react";
import { NewInvoiceDrawer } from "@/features/invoices/NewInvoiceDrawer";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

interface Props {
  tenantId: string;
  bookingId: string;
  customerId: string;
  reviewNeeded?: boolean | null;
  reviewReason?: string | null;
  existingOnly?: boolean;
}

export function BookingInvoicePanel({ tenantId, bookingId, customerId, reviewNeeded, reviewReason, existingOnly = false }: Props) {
  const { hasPermission, profile } = useCurrentUser();
  const can = (code: string) => profile?.user_type === "platform" || hasPermission(code);
  const q = useDeskBookingInvoices(tenantId, [bookingId]);
  const invoices = q.data?.[bookingId] ?? [];
  const [open, setOpen] = useState(false);

  if (!can("invoices.view")) return null;
  if (existingOnly && !invoices.length) return q.isError ? <p className="text-sm text-destructive">Could not load the invoice.</p> : null;

  return (
    <div className="sk-card p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Receipt className="h-4 w-4" /> Invoice
      </div>
      <BookingPaymentSummary tenantId={tenantId} bookingId={bookingId} customerId={customerId} />
      {reviewNeeded && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Invoice needs review</div>
            <div className="mt-0.5 leading-relaxed">
              {reviewReason || "This booking changed after the invoice was finalised."}
            </div>
          </div>
        </div>
      )}
      {!existingOnly && !q.isLoading && !q.isError && !invoices.length && can("invoices.create") && <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}><Plus />Create invoice</Button>}

      {open && (
        <NewInvoiceDrawer tenantId={tenantId} presetCustomerId={customerId}
          onClose={() => setOpen(false)}
          onCreated={(id) => { setOpen(false); window.location.assign(`/admin/invoices/${id}`); }} />
      )}
    </div>
  );
}