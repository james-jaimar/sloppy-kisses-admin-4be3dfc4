import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface BookingAddon {
  name: string;
  code: string | null;
  quantity: number;
  per_night: boolean;
}

/** Paid hotel add-ons (Walk, Stay & Play, …) per booking, so floor staff can see what's owed. */
export function useHotelBookingAddons(bookingIds: string[]) {
  const ids = Array.from(new Set(bookingIds)).sort();
  return useQuery({
    queryKey: ["hotel_booking_addons", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, BookingAddon[]>> => {
      const { data, error } = await supabase
        .from("hotel_booking_surcharges" as any)
        .select("booking_id, quantity, surcharge:hotel_surcharges(name, code, per_night)")
        .in("booking_id", ids);
      if (error) throw error;
      const out: Record<string, BookingAddon[]> = {};
      for (const r of (data ?? []) as any[]) {
        if (!r.surcharge) continue;
        (out[r.booking_id] ??= []).push({
          name: r.surcharge.name,
          code: r.surcharge.code ?? null,
          quantity: Math.round(Number(r.quantity) || 1),
          per_night: Boolean(r.surcharge.per_night),
        });
      }
      return out;
    },
  });
}

export const isWalk = (a: BookingAddon) => /walk/i.test(a.name) || /walk/i.test(a.code ?? "");

/** "Walk · 2 dogs daily" / "Grooming · 1" */
export function addonLabel(a: BookingAddon) {
  if (a.per_night) return `${a.name} · ${a.quantity} ${a.quantity === 1 ? "dog" : "dogs"} daily`;
  return `${a.name} × ${a.quantity}`;
}
