import { useMemo } from "react";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import type { WorkDept } from "./queries";

/** Which work departments the signed-in user may use. */
export function useWorkDepts() {
  const { hasPermission, profile, currentTenant, loading } = useCurrentUser();
  return useMemo(() => {
    const depts: WorkDept[] = [];
    if (hasPermission("work.grooming")) depts.push("grooming");
    if (hasPermission("work.hotel")) depts.push("hotel");
    if (hasPermission("work.daycare")) depts.push("daycare");
    if (hasPermission("work.transport")) depts.push("transport");
    return {
      depts,
      canAccess: hasPermission("work.access"),
      canSignoff: hasPermission("work.signoff"),
      canRaiseIncident: hasPermission("incidents.raise"),
      canAcknowledgeIncident: hasPermission("incidents.acknowledge"),
      profile,
      tenantId: currentTenant?.id ?? null,
      loading,
    };
  }, [hasPermission, profile, currentTenant, loading]);
}