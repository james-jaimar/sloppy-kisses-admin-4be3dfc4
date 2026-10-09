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

/** Total walks owed each day across the stay. */
export function walksPerDay(addons: BookingAddon[]) {
  return addons.filter((a) => isWalk(a) && a.per_night).reduce((n, a) => n + a.quantity, 0)
    || (addons.some(isWalk) ? 1 : 0);
}

/** "Walk · 2 per day" / "Grooming · 1" */
export function addonLabel(a: BookingAddon) {
  if (a.per_night) return `${a.name} · ${a.quantity} per day`;
  return `${a.name} × ${a.quantity}`;
}
