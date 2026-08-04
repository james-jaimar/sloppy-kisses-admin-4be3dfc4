import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface CancellationQuote {
  booking_id: string;
  basis: "grooming_notice" | "hotel_deposit_forfeit" | "none";
  percent: number;
  base: number;
  hours_notice: number;
  notice_window_hours: number;
  within_notice_window: boolean;
  applies: boolean;
  amount: number;
}

/** What cancelling this booking would cost right now, per the tenant's policy settings. */
export function useCancellationQuote(bookingId: string | null) {
  return useQuery({
    queryKey: ["cancellation-quote", bookingId],
    enabled: !!bookingId,
    staleTime: 30_000,
    queryFn: async (): Promise<CancellationQuote | null> => {
      const { data, error } = await supabase.rpc("booking_cancellation_quote", {
        p_booking_id: bookingId,
      } as any);
      if (error) throw error;
      return (data as any) ?? null;
    },
  });
}

/**
 * Cancels a booking. The DB trigger strips the booking's charges from any unsent
 * invoice and replaces them with the cancellation fee (unless it is waived).
 */
export function useCancelBookingWithFee(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      waive,
      reason,
    }: {
      bookingId: string;
      waive: boolean;
      reason?: string | null;
    }) => {
      const { error } = await supabase
        .from("bookings")
        .update({
          status: "cancelled" as any,
          cancellation_fee_waived: waive,
          cancellation_reason: reason?.trim() || null,
        } as any)
        .eq("id", bookingId)
        .eq("tenant_id", tenantId);
      if (error) throw error;

      const { data } = await supabase
        .from("bookings")
        .select("cancellation_fee_zar, cancellation_fee_note")
        .eq("id", bookingId)
        .maybeSingle();
      return {
        fee: Number((data as any)?.cancellation_fee_zar ?? 0),
        note: (data as any)?.cancellation_fee_note as string | null,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["booking-invoice"] });
    },
  });
}