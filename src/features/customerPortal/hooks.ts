import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

export interface PortalCustomer {
  id: string;
  tenant_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  phone_alt: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postcode: string | null;
  notify_email: boolean | null;
}

/** Resolves the current signed-in user's customer row (portal-enabled). */
export function useCurrentCustomer() {
  const { profile } = useCurrentUser();
  return useQuery({
    queryKey: ["portal_current_customer", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async (): Promise<PortalCustomer | null> => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, tenant_id, first_name, last_name, full_name, email, mobile, phone_alt, address_line_1, address_line_2, suburb, city, province, postcode, notify_email")
        .eq("linked_profile_id", profile!.id)
        .eq("portal_access_enabled", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PortalCustomer | null;
    },
  });
}