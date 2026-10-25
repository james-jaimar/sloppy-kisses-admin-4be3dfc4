import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { HOTEL_REVIEW_STATUSES, HOTEL_OPEN_QUOTE_STATUSES } from "./reviewQueue";

export function useHotelReviewCounts(tenantId: string | null) {
  const { hasPermission, profile } = useCurrentUser();
  const canView = profile?.user_type === "platform" || hasPermission("hotel.view");
  return useQuery({
    queryKey: ["hotel_review_counts", tenantId],
    enabled: Boolean(tenantId) && canView,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!tenantId) throw new Error("No tenant selected");
      const [bookings, enquiries, quotes] = await Promise.all([
        supabase.from("bookings").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).in("service_type", ["hotel_dog", "hotel_cat"])
          .in("status", [...HOTEL_REVIEW_STATUSES]),
        supabase.from("booking_requests").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).eq("kind", "new").in("service_type", ["hotel_dog", "hotel_cat"])
          .in("status", ["pending_review", "needs_info", "approved"]).is("converted_booking_id", null),
        supabase.from("estimates").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).in("service_type", ["hotel_dog", "hotel_cat"])
          .in("status", [...HOTEL_OPEN_QUOTE_STATUSES]).is("booking_id", null),
      ]);
      for (const result of [bookings, enquiries, quotes]) if (result.error) throw result.error;
      const review = (bookings.count ?? 0) + (enquiries.count ?? 0);
      return { review, quotes: quotes.count ?? 0, total: review + (quotes.count ?? 0) };
    },
  });
}