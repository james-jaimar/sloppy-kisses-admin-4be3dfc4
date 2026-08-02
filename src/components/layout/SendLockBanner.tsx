import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useCommsSettings } from "@/features/comms/queries";

/**
 * Always-visible reminder that outbound email is locked, so nobody assumes
 * customers are being notified while the system is in test mode.
 */
export function SendLockBanner() {
  const { tenant } = useCurrentTenant();
  const { data: settings } = useCommsSettings(tenant?.id ?? null);

  if (!settings || settings.sending_enabled === true) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-sk-coral/40 bg-sk-coral-soft px-4 py-2 text-xs text-foreground sm:px-6">
      <Lock className="h-3.5 w-3.5 shrink-0 text-sk-coral" />
      <span className="font-semibold">Outbound email is locked.</span>
      <span className="text-muted-foreground">
        Only test addresses receive mail — customers are not being notified.
      </span>
      <Link to="/admin/settings/email" className="font-semibold text-sk-coral underline underline-offset-2">
        Manage
      </Link>
    </div>
  );
}