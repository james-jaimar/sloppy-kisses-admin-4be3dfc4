import { createContext, useCallback, useContext, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useBookingDetail } from "./queries";
import { BookingDetailPanel } from "./BookingDetailPanel";

/**
 * Opens a booking in the slide-over panel without leaving the current board.
 * Boards keep their real link (so ctrl/cmd-click and "open in new tab" still work);
 * a plain click is intercepted and opens the panel instead.
 */
interface Ctx {
  openBooking: (id: string) => void;
}

const BookingPeekContext = createContext<Ctx | null>(null);

export function BookingPeekProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const openBooking = useCallback((next: string) => setId(next), []);
  const value = useMemo(() => ({ openBooking }), [openBooking]);
  return (
    <BookingPeekContext.Provider value={value}>
      {children}
      {id && <PeekHost bookingId={id} onClose={() => setId(null)} />}
    </BookingPeekContext.Provider>
  );
}

function PeekHost({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const { tenant } = useCurrentTenant();
  const q = useBookingDetail(bookingId, tenant?.id);
  if (!tenant || !q.data) return null;
  return <BookingDetailPanel tenantId={tenant.id} booking={q.data} onClose={onClose} />;
}

/** Returns an onClick for booking links: plain click opens the panel, modified clicks navigate normally. */
export function useBookingPeekClick() {
  const ctx = useContext(BookingPeekContext);
  return useCallback(
    (bookingId: string) => (e: MouseEvent) => {
      if (!ctx) return; // outside the admin shell: fall back to navigation
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      ctx.openBooking(bookingId);
    },
    [ctx],
  );
}
