import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BadgeCheck, CircleDollarSign } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

export type PaymentFlagStatus = "paid" | "unpaid" | "overdue" | "draft" | "none";

export interface PaymentFlag {
  status: PaymentFlagStatus;
  invoiceId: string | null;
  invoiceNumber: string | null;
  balanceDue: number;
  dueDate: string | null;
}

const EMPTY: Record<string, PaymentFlag> = {};
const PaymentFlagsContext = createContext<Record<string, PaymentFlag>>(EMPTY);

function deriveStatus(status: string, balanceDue: number, dueDate: string | null): PaymentFlagStatus {
  if (status === "paid" || balanceDue <= 0) return "paid";
  if (status === "draft") return "draft";
  if (status === "void" || status === "cancelled") return "none";
  if (dueDate && new Date(dueDate) < new Date(new Date().toDateString())) return "overdue";
  return "unpaid";
}

/** Fetches invoice status for a set of bookings. Safe to call with an empty list. */
export function useBookingPaymentFlags(bookingIds: string[]): Record<string, PaymentFlag> {
  const { currentTenant, hasPermission, profile } = useCurrentUser();
  const tenantId = currentTenant?.id ?? null;
  const canSee = profile?.user_type === "platform" || hasPermission("invoices.view");
  const ids = useMemo(() => Array.from(new Set(bookingIds.filter(Boolean))).sort(), [bookingIds]);

  const q = useQuery({
    queryKey: ["booking-payment-flags", tenantId, ids],
    enabled: Boolean(tenantId) && canSee && ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_items")
        .select("booking_id, invoice:invoices(id, invoice_number, status, due_date, balance_due)")
        .eq("tenant_id", tenantId as string)
        .in("booking_id", ids);
      if (error) throw error;
      const map: Record<string, PaymentFlag> = {};
      for (const row of (data ?? []) as any[]) {
        const inv = row.invoice;
        if (!row.booking_id || !inv) continue;
        const balance = Number(inv.balance_due ?? 0);
        const flag: PaymentFlag = {
          status: deriveStatus(String(inv.status), balance, inv.due_date ?? null),
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number ?? null,
          balanceDue: balance,
          dueDate: inv.due_date ?? null,
        };
        const existing = map[row.booking_id];
        // Worst status wins so a part-paid booking still shows as outstanding.
        const rank: Record<PaymentFlagStatus, number> = { overdue: 4, unpaid: 3, draft: 2, paid: 1, none: 0 };
        if (!existing || rank[flag.status] > rank[existing.status]) map[row.booking_id] = flag;
      }
      return map;
    },
  });

  return q.data ?? EMPTY;
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
};

/** Small inline chip for board cards. Renders nothing when there's no invoice. */
export function PaymentChip({
  bookingId,
  showPaid = false,
}: {
  bookingId: string | null | undefined;
  showPaid?: boolean;
}) {
  const flag = usePaymentFlag(bookingId);
  if (!flag) return null;
  if (flag.status === "paid" && !showPaid) return null;
  const meta = CHIP_META[flag.status];
  if (!meta) return null;
  const { Icon } = meta;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}
      title={flag.invoiceNumber ? `Invoice ${flag.invoiceNumber}` : undefined}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}