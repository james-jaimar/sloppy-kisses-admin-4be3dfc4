import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useXeroPush, useXeroSettings } from "./queries";

type Props = {
  entityType: "customer" | "invoice" | "payment" | "credit_note";
  entityId: string;
  synced?: boolean;
  className?: string;
};

/** Small "Sync to Xero" action shown on customer, invoice and credit note pages. */
export function SyncToXeroButton({ entityType, entityId, synced, className }: Props) {
  const { tenant } = useCurrentTenant();
  const { hasPermission, profile } = useCurrentUser();
  const can = profile?.user_type === "platform" || hasPermission("settings.xero.manage");
  const settings = useXeroSettings(tenant?.id ?? null);
  const push = useXeroPush(tenant?.id ?? null);

  if (!can || !settings.data?.enabled) return null;

  return (
    <button
      onClick={async () => {
        try {
          const res = await push.mutateAsync({ entity_type: entityType, entity_ids: [entityId] });
          const first = res?.results?.[0];
          if (first && !first.ok) toast.error(first.error);
          else toast.success(synced ? "Updated in Xero" : "Sent to Xero");
        } catch (e: any) { toast.error(e?.message ?? "Xero push failed"); }
      }}
      disabled={push.isPending}
      className={className ?? "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold disabled:opacity-50"}
    >
      {push.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      {synced ? "Update in Xero" : "Sync to Xero"}
    </button>
  );
}
