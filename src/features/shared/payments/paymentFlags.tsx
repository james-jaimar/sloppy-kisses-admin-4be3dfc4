import { createContext, useContext, type ReactNode } from "react";
import { useDeskBookingInvoices } from "./deskInvoiceQueries";
import { invoiceState, visitInvoiceState, outstandingTotal } from "./invoiceSummary";
import { AlertCircle, BadgeCheck, CircleDollarSign } from "lucide-react";
import { fmtZar } from "@/features/invoices/status";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

export type PaymentFlagStatus = "paid" | "unpaid" | "overdue" | "draft" | "none" | "unavailable" | "loading";

export interface PaymentFlag {
  status: PaymentFlagStatus;
  invoiceId: string | null;
  invoiceNumber: string | null;
  balanceDue: number;
  dueDate: string | null;
  shared?: boolean;
}

const EMPTY: Record<string, PaymentFlag> = {};
const PaymentFlagsContext = createContext<Record<string, PaymentFlag>>(EMPTY);

/** Board and booking panel share direct and invoice-item link resolution. */
export function useBookingPaymentFlags(bookingIds: string[]): Record<string, PaymentFlag> {
  const { currentTenant, hasPermission, profile } = useCurrentUser();
  const canSee = profile?.user_type === "platform" || hasPermission("invoices.view");
  const q = useDeskBookingInvoices(currentTenant?.id, bookingIds);
  if (!canSee) return EMPTY;
  const map: Record<string, PaymentFlag> = {};
  for (const id of bookingIds) {
    const invoices = q.data?.[id] ?? [];
    const state = q.isError ? "unavailable" : q.isLoading ? "loading" : visitInvoiceState(invoices);
    const first = invoices[0];
    const overdue = invoices.some(inv => invoiceState(inv) === "outstanding" && inv.due_date && inv.due_date < new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }));
    map[id] = { status: state === "outstanding" ? overdue ? "overdue" : "unpaid" : state === "cancelled" ? "none" : state,
      invoiceId: first?.id ?? null, invoiceNumber: first?.invoice_number ?? null,
      balanceDue: outstandingTotal(invoices), dueDate: first?.due_date ?? null, shared: invoices.some(inv => inv.shared) };
  }
  return map;
}

/** Wrap a board so its cards can render payment chips without each one querying. */
export function PaymentFlagsProvider({
  bookingIds,
  children,
}: {
  bookingIds: string[];
  children: ReactNode;
}) {
  const flags = useBookingPaymentFlags(bookingIds);
  return <PaymentFlagsContext.Provider value={flags}>{children}</PaymentFlagsContext.Provider>;
}

export function usePaymentFlag(bookingId: string | null | undefined): PaymentFlag | undefined {
  const flags = useContext(PaymentFlagsContext);
  return bookingId ? flags[bookingId] : undefined;
}

const CHIP_META: Record<
  PaymentFlagStatus,
  { label: string; className: string; Icon: typeof AlertCircle } | null
> = {
  overdue: { label: "Overdue", className: "bg-destructive/10 text-destructive", Icon: AlertCircle },
  unpaid: { label: "Unpaid", className: "bg-sk-orange-soft text-sk-orange", Icon: CircleDollarSign },
  draft: { label: "Not invoiced", className: "bg-muted text-muted-foreground", Icon: CircleDollarSign },
  paid: { label: "Paid", className: "bg-sk-green-soft text-sk-green", Icon: BadgeCheck },
  none: null,
  unavailable: { label: "Balances unavailable", className: "bg-muted text-muted-foreground", Icon: AlertCircle },
  loading: { label: "Loading balances…", className: "bg-muted text-muted-foreground", Icon: CircleDollarSign },
};

/** Small inline chip for board cards. Renders nothing when there's no invoice. */
export function PaymentChip({
  bookingId,
  showPaid = false,
  collection = false,
}: {
  bookingId: string | null | undefined;
  showPaid?: boolean;
  collection?: boolean;
}) {
  const flag = usePaymentFlag(bookingId);
  if (!flag) return null;
  if (flag.status === "paid" && !showPaid) return null;
  const meta = CHIP_META[flag.status];
  if (!meta) return collection ? <span className="text-xs text-muted-foreground">No active invoice</span> : null;
  const { Icon } = meta;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}
      title={flag.invoiceNumber ? `Invoice ${flag.invoiceNumber}` : undefined}
    >
      <Icon className="h-3 w-3" />
      {collection && ["unpaid", "overdue"].includes(flag.status) ? `${flag.shared ? "Shared invoice" : "Outstanding"} ${fmtZar(flag.balanceDue)}` : meta.label}
    </span>
  );
}