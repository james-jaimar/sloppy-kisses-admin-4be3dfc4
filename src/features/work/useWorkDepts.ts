import { useMemo } from "react";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useMyResourceIds } from "@/features/settings/resourceStaffQueries";
import type { WorkDept } from "./queries";

/** Which work departments the signed-in user may use. */
export function useWorkDepts() {
  const { hasPermission, profile, currentTenant, loading } = useCurrentUser();
  const myResourcesQ = useMyResourceIds(currentTenant?.id ?? null, profile?.id ?? null);
  const myResourceIds = myResourcesQ.data ?? [];
  const resourceKey = myResourceIds.slice().sort().join(",");
  return useMemo(() => {
    const depts: WorkDept[] = [];
    if (hasPermission("work.grooming")) depts.push("grooming");
    if (hasPermission("work.grooming_mobile")) depts.push("grooming_mobile");
    if (hasPermission("work.hotel")) depts.push("hotel");
    if (hasPermission("work.daycare")) depts.push("daycare");
    if (hasPermission("work.transport")) depts.push("transport");
    return {
      depts,
      /** Resources this user is assigned to. Empty means "no restriction". */
      myResourceIds: resourceKey ? resourceKey.split(",") : [],
      canAccess: hasPermission("work.access"),
      canSignoff: hasPermission("work.signoff"),
      canAddDaycareNotes: hasPermission("daycare.notes"),
      canRaiseIncident: hasPermission("incidents.raise"),
      canAcknowledgeIncident: hasPermission("incidents.acknowledge"),
      profile,
      tenantId: currentTenant?.id ?? null,
      loading,
    };
  }, [hasPermission, profile, currentTenant, loading, resourceKey]);
}