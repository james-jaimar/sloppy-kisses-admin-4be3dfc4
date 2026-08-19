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

  const canSeeComms = isPlatform || hasPermission("comms.view");
  const canSeeDaycare = isPlatform || hasPermission("daycare.view");

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

  const daycareAttention = useQuery({
    queryKey: ["nav-badges", "daycare_attention", tenantId],
    enabled: Boolean(tenantId) && canSeeDaycare,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const sb = supabase as any;
      const [notes, incidents] = await Promise.all([
        sb
          .from("daycare_day_notes")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId as string)
          .eq("office_flag", true)
          .is("handled_at", null),
        sb
          .from("incidents")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId as string)
          .in("state", ["open", "acknowledged"]),
      ]);
      if (notes.error) throw notes.error;
      if (incidents.error) throw incidents.error;
      return (notes.count ?? 0) + (incidents.count ?? 0);
    },
  });

  return {
    "comms.view": commsFailures.data ?? 0,
    "daycare.view": daycareAttention.data ?? 0,
  };
}