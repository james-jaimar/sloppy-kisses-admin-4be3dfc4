import { useState } from "react";
import { Link } from "react-router-dom";
import { Receipt, Plus, ExternalLink } from "lucide-react";
import { useBookingInvoice } from "@/features/invoices/queries";
import { InvoiceStatusChip, fmtZar } from "@/features/invoices/status";
import { NewInvoiceDrawer } from "@/features/invoices/NewInvoiceDrawer";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

interface Props { tenantId: string; bookingId: string; customerId: string }

export function BookingInvoicePanel({ tenantId, bookingId, customerId }: Props) {
  const { hasPermission, profile } = useCurrentUser();
  const can = (code: string) => profile?.user_type === "platform" || hasPermission(code);
  const q = useBookingInvoice(tenantId, bookingId);
  const inv = q.data?.invoice;
  const [open, setOpen] = useState(false);

  return (
    <div className="sk-card p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Receipt className="h-4 w-4" /> Invoice
      </div>
      {q.isLoading ? (
        <div className="mt-2 text-xs text-muted-foreground">Loading…</div>
      ) : inv ? (
        <div className="mt-2 space-y-2 text-sm">
          <Link to={`/admin/invoices/${inv.id}`} className="inline-flex items-center gap-1 font-medium hover:text-sk-coral-dark">
            {inv.invoice_number} <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <div><InvoiceStatusChip status={inv.status} /></div>
          <div className="text-xs text-muted-foreground">
            Total {fmtZar(inv.total)} · Balance {fmtZar(inv.balance_due)}
          </div>
          {Number(inv.balance_due ?? 0) > 0 && inv.due_date && (
            <div
              className={`text-xs font-semibold ${
                new Date(inv.due_date) < new Date(new Date().toDateString())
                  ? "text-destructive"
                  : "text-sk-orange"
              }`}
            >
              {new Date(inv.due_date) < new Date(new Date().toDateString())
                ? `Overdue since ${new Date(inv.due_date).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}`
                : `Due ${new Date(inv.due_date).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}`}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mt-2 text-xs text-muted-foreground">No invoice linked to this booking.</div>
          {can("invoices.create") && (
          <button onClick={() => setOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sk-coral px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-sk-coral-dark">
            <Plus className="h-3.5 w-3.5" /> Create invoice
          </button>
          )}
        </>
      )}

      {open && (
        <NewInvoiceDrawer tenantId={tenantId} presetCustomerId={customerId}
          onClose={() => setOpen(false)}
          onCreated={(id) => { setOpen(false); window.location.assign(`/admin/invoices/${id}`); }} />
      )}
    </div>
  );
}