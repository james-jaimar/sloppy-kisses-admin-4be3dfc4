import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { NewBookingModal } from "@/features/bookings/NewBookingModal";
import { CustomerFormModal } from "@/features/customers/CustomerFormModal";
import { EnrolmentDrawer } from "@/features/daycare/EnrolmentDrawer";
import { NewInvoiceDrawer } from "@/features/invoices/NewInvoiceDrawer";

export type QuickAddKind = "booking" | "customer" | "enrolment" | "invoice";

interface Ctx {
  open: (kind: QuickAddKind) => void;
}

const QuickAddCtx = createContext<Ctx | null>(null);

export function useQuickAdd() {
  const ctx = useContext(QuickAddCtx);
  if (!ctx) return { open: () => {} } as Ctx;
  return ctx;
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const { currentTenant } = useCurrentUser();
  const tenantId = currentTenant?.id ?? null;
  const navigate = useNavigate();
  const [active, setActive] = useState<QuickAddKind | null>(null);

  const open = useCallback((kind: QuickAddKind) => setActive(kind), []);
  const close = useCallback(() => setActive(null), []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <QuickAddCtx.Provider value={value}>
      {children}
      {active === "booking" && <NewBookingModal onClose={close} />}
      {active === "customer" && tenantId && (
        <CustomerFormModal
          tenantId={tenantId}
          onClose={close}
          onCreated={(id) => {
            close();
            navigate(`/admin/customers/${id}`);
          }}
        />
      )}
      {active === "enrolment" && tenantId && (
        <EnrolmentDrawer tenantId={tenantId} open onOpenChange={(o) => { if (!o) close(); }} editing={null} />
      )}
      {active === "invoice" && tenantId && (
        <NewInvoiceDrawer
          tenantId={tenantId}
          onClose={close}
          onCreated={(id) => {
            close();
            navigate(`/admin/invoices/${id}`);
          }}
        />
      )}
    </QuickAddCtx.Provider>
  );
}