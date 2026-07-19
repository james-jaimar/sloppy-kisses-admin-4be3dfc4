import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export function usePortalPets(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ["portal_pets_for_request", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, species, breed")
        .eq("customer_id", customerId!)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type ResourceType =
  | "cattery_area"
  | "daycare_area"
  | "hotel_area"
  | "inhouse_grooming"
  | "mobile_van"
  | "transport_vehicle";

export function useResources(tenantId: string | null | undefined, types: ResourceType[]) {
  return useQuery({
    queryKey: ["portal_resources", tenantId, types.join(",")],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select("id, name, type, description")
        .eq("tenant_id", tenantId!)
        .in("type", types)
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGroomingPackages(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["portal_grooming_packages", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_packages")
        .select("id, name, species, size_band, price_zar, package_type")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGroomingAddons(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["portal_grooming_addons", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grooming_addons")
        .select("id, name, price_zar, kind")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDaycarePlans(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["portal_daycare_plans", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daycare_plans")
        .select("id, name, days_per_week, price, billing_period")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCustomerBookings(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ["portal_upcoming_bookings_for_transport", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_number, service_type, start_at")
        .eq("customer_id", customerId!)
        .gte("start_at", new Date().toISOString())
        .order("start_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}