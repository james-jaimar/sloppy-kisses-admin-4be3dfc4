import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface HotelReviewData {
  checklist: Record<string, boolean>;
  customer_message: string | null;
  collection_time: string | null;
  approved_at: string | null;
  confirmed_at?: string | null;
  verified_payment_id?: string | null;
  payment_verified?: boolean;
  payment_percent_override: number | null;
  override_reason?: string | null;
  estimate: { id: string; estimate_number: string; total: number; extras: unknown } | null;
  public_settings?: { approval_checklist: { code: string; label: string }[]; payment_cutoff_days: number; advance_deposit_pct: number };
}
export function useHotelReview(bookingId: string, portal = false) {
  return useQuery({ queryKey: ["hotel_review", bookingId, portal], queryFn: async (): Promise<HotelReviewData | null> => {
    if (portal) {
      const { data, error } = await supabase.rpc("customer_hotel_review", { p_booking_id: bookingId });
      if (error) throw error;
      return data as unknown as HotelReviewData | null;
    }
    const { data, error } = await supabase.from("hotel_booking_reviews").select("*, estimate:estimates(id, estimate_number, total, extras)").eq("booking_id", bookingId).maybeSingle();
    if (error) throw error;
    return data as unknown as HotelReviewData | null;
  }});
}
export function useHotelReviewAction(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ action, data = {} }: { action: string; data?: Record<string, unknown> }) => {
    const { data: result, error } = await supabase.rpc("hotel_review_action", { p_booking_id: bookingId, p_action: action, p_data: data as never });
    if (error) throw error;
    return result;
  }, onSuccess: async () => {
    await Promise.all(["hotel_review", "hotel_pipeline", "hotel_receipts", "bookings", "booking_invoice", "hotel_bookings", "hotel_money", "portal_booking", "estimates", "invoices", "payments"].map(key => qc.invalidateQueries({ queryKey: [key] })));
  }});
}