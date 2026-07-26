import { Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useConsentStatus } from "./consentQueries";
import ConsentWizard from "./ConsentWizard";

export default function ConsentGate() {
  const q = useConsentStatus();

  if (q.isLoading) {
    return (
      <>
        <Outlet />
        <div className="fixed inset-0 z-40 grid place-items-center bg-background/60 backdrop-blur-sm">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  const status = q.data;
  return (
    <>
      <Outlet />
      {status?.needsWizard && status.customer && (
        <ConsentWizard status={status} onDone={() => q.refetch()} />
      )}
    </>
  );
}