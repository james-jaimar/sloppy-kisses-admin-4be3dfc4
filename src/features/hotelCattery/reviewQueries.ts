import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useHotelReview(bookingId: string) {
  return useQuery({ queryKey: ["hotel_review", bookingId], queryFn: async () => {
    const { data, error } = await supabase.from("hotel_booking_reviews").select("*, estimate:estimates(id, estimate_number, total, extras)").eq("booking_id", bookingId).maybeSingle();
    if (error) throw error;
    return data;
  }});
}
export function useHotelReviewAction(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ action, data = {} }: { action: string; data?: Record<string, unknown> }) => {
    const { data: result, error } = await supabase.rpc("hotel_review_action", { p_booking_id: bookingId, p_action: action, p_data: data as never });
    if (error) throw error;
    return result;
  }, onSuccess: async () => {
    await Promise.all(["hotel_review", "bookings", "hotel_bookings", "hotel_money", "portal_booking", "estimates", "invoices", "payments"].map(key => qc.invalidateQueries({ queryKey: [key] })));
  }});
}