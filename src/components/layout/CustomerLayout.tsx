import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
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
  const shouldShow =
    consent.data?.needsWizard &&
    consent.data.customer &&
    !onRegistrationRoute &&
    (consent.data.mode === "hard" ? true : !dismissed);

  return (
    <div className="flex min-h-screen w-full bg-sk-bg text-foreground">
      <AppSidebar items={customerNav} footerLabel="Customer Portal" />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileTopBar items={customerNav} footerLabel="Customer Portal" />
        <Outlet />
      </div>
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