import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface PortalQuote {
  id: string;
  estimate_number: string;
  status: string;
  service_type: string | null;
  accommodation_type: string | null;
  start_at: string | null;
  end_at: string | null;
  total: number;
  hold_expires_at: string | null;
  expiry_date: string | null;
  booking_id: string | null;
  created_via: string | null;
  pet_ids: string[];
}

export function usePortalQuotes(customerId?: string) {
  return useQuery({
    queryKey: ["portal_quotes", customerId],
    enabled: !!customerId,
    queryFn: async (): Promise<PortalQuote[]> => {
      const { data, error } = await supabase
        .from("estimates")
        .select(
          "id, estimate_number, status, service_type, accommodation_type, start_at, end_at, total, hold_expires_at, expiry_date, booking_id, created_via, pet_ids",
        )
        .eq("customer_id", customerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PortalQuote[];
    },
  });
}

export function usePortalQuote(id?: string) {
  return useQuery({
    queryKey: ["portal_quote", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates")
        .select(
          "id, estimate_number, status, service_type, accommodation_type, start_at, end_at, total, subtotal, notes, hold_expires_at, expiry_date, booking_id, public_token, pet_ids",
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      const { data: items } = await supabase
        .from("estimate_items")
        .select("id, description, quantity, unit_price, line_total, sort_order")
        .eq("estimate_id", id!)
        .order("sort_order");
      return { quote: data as any, items: (items ?? []) as any[] };
    },
  });
}

/** Accept or cancel one of the customer's own quotes. */
export function usePortalQuoteAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quoteId, action }: { quoteId: string; action: "accept" | "cancel" }) => {
      const { data, error } = await supabase.functions.invoke("portal-quote-action", {
        body: { quote_id: quoteId, action },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.ok === false) throw new Error((data as any).error ?? "Something went wrong");
      return data as { ok: true; booking_id?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal_quotes"] });
      qc.invalidateQueries({ queryKey: ["portal_quote"] });
      qc.invalidateQueries({ queryKey: ["portal_bookings"] });
    },
  });
}

/** Hours/minutes left on a date hold, or null once it has lapsed. */
export function holdRemaining(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return hours >= 1 ? `${hours}h ${mins}m` : `${mins}m`;
}
