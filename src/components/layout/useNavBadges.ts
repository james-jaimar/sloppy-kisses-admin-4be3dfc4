import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

/**
 * Live badge counts for the admin sidebar. Keyed by the nav item's
 * permission `code` so `AppSidebar` can merge without extra plumbing.
 * Each sub-query is permission-gated so we don't fetch what the user
 * can't see. Refetches every 60s and on window focus.
 */
export function useNavBadges(): Record<string, number> {
  const { currentTenant, hasPermission, profile } = useCurrentUser();
  const tenantId = currentTenant?.id ?? null;
  const isPlatform = profile?.user_type === "platform";

  const canSeeRequests = isPlatform || hasPermission("booking_requests.view");
  const canSeeComms = isPlatform || hasPermission("comms.view");

  const requests = useQuery({
    queryKey: ["nav-badges", "booking_requests", tenantId],
    enabled: Boolean(tenantId) && canSeeRequests,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId as string)
        .in("status", ["pending_review", "needs_info"]);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const commsFailures = useQuery({
    queryKey: ["nav-badges", "comms_failed", tenantId],
    enabled: Boolean(tenantId) && canSeeComms,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("notification_events")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId as string)
        .eq("status", "failed")
        .gte("created_at", since);
      if (error) throw error;
      return count ?? 0;
    },
  });

  return {
    "booking_requests.view": requests.data ?? 0,
    "comms.view": commsFailures.data ?? 0,
  };
}