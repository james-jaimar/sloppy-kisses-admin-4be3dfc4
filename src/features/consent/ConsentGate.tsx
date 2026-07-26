import { Outlet } from "react-router-dom";
import { useState } from "react";
import { useConsentStatus } from "./consentQueries";
import ConsentWizard from "./ConsentWizard";

/**
 * ConsentGate: shown only when consent must BLOCK (hard mode, grace expired).
 * Soft-mode nudging is handled by the dashboard banner + layout-level modal
 * that can be dismissed.
 */
export default function ConsentGate() {
  const q = useConsentStatus();
  const [dismissed, setDismissed] = useState(false);
  const status = q.data;

  return (
    <>
      <Outlet />
      {status?.needsWizard && status.customer && !dismissed && (
        <ConsentWizard
          status={status}
          onDone={() => q.refetch()}
          onDismiss={status.mode === "soft" ? () => setDismissed(true) : undefined}
        />
      )}
    </>
  );
}