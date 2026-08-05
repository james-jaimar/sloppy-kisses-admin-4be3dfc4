import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { MobileTopBar } from "./MobileTopBar";
import { customerNav } from "@/constants/navigation";
import { useConsentStatus } from "@/features/consent/consentQueries";
import ConsentWizard from "@/features/consent/ConsentWizard";

export default function CustomerLayout() {
  const consent = useConsentStatus();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);
  // Reset dismissal when consent completes or new day
  useEffect(() => {
    if (!consent.data?.needsWizard) setDismissed(false);
  }, [consent.data?.needsWizard]);

  const onRegistrationRoute = location.pathname.startsWith("/customer/registration");
  const onBookingFlow = location.pathname.startsWith("/customer/bookings/new");
  const shouldShow =
    consent.data?.needsWizard &&
    consent.data.customer &&
    !onRegistrationRoute &&
    (consent.data.mode === "hard" ? true : !dismissed);

  return (
    <div className="flex min-h-screen w-full bg-sk-bg text-foreground">
      <AppSidebar items={customerNav} footerLabel="Customer Portal" />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileTopBar
          items={customerNav}
          footerLabel="Customer Portal"
          action={
            !onBookingFlow ? (
              <Link
                to="/customer/bookings/new"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark"
              >
                <CalendarPlus className="h-4 w-4" /> Book
              </Link>
            ) : undefined
          }
        />
        <Outlet />
      </div>
      {!onBookingFlow && !onRegistrationRoute && (
        <Link
          to="/customer/bookings/new"
          className="fixed bottom-5 right-5 z-40 hidden items-center gap-2 rounded-full bg-sk-coral px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-sk-coral-dark lg:inline-flex"
        >
          <CalendarPlus className="h-4 w-4" /> Book a service
        </Link>
      )}
      {shouldShow && (
        <ConsentWizard
          status={consent.data!}
          onDone={() => consent.refetch()}
          onDismiss={consent.data!.mode === "soft" ? () => setDismissed(true) : undefined}
        />
      )}
    </div>
  );
}