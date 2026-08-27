import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";

/**
 * Tenant-level privacy switch: when "Hide customer phone numbers from staff" is on,
 * only users with `customers.contact.view` (front desk, accounts, admins) can see or
 * call customer mobile numbers. Drivers and groomers get the number hidden.
 */
export function useCustomerContactVisibility(): { canSeeCustomerPhone: boolean; isLoading: boolean } {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();

  const q = useQuery({
    queryKey: ["policy_settings_contact_privacy", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("policy_settings")
        .select("hide_customer_phone_from_staff")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data?.hide_customer_phone_from_staff);
    },
  });

  const hidden = q.data ?? false;
  return {
    canSeeCustomerPhone: !hidden || hasPermission("customers.contact.view"),
    isLoading: q.isLoading,
  };
}
