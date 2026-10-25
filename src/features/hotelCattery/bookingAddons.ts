import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface BookingAddon {
  name: string;
  code: string | null;
  quantity: number;
  per_night: boolean;
  quantity_basis?: "catalog" | "total";
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
        .select("booking_id, quantity, quantity_basis, surcharge:hotel_surcharges(name, code, per_night)")
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
          quantity_basis: r.quantity_basis,
        });
      }
      return out;
    },
  });
}

export const isWalk = (a: BookingAddon) => /walk/i.test(a.name) || /walk/i.test(a.code ?? "");

/** Total walks owed each day across the stay. */
export function walksPerDay(addons: BookingAddon[]) {
  return addons.filter((a) => isWalk(a) && a.per_night && a.quantity_basis !== "total").reduce((n, a) => n + a.quantity, 0);
}

/** "Walk · 2 per day" / "Grooming · 1" */
export function addonLabel(a: BookingAddon) {
  if (a.quantity_basis === "total") return `${a.name} · ${a.quantity} total over stay`;
  if (a.per_night) return `${a.name} · ${a.quantity} per day`;
  return `${a.name} × ${a.quantity}`;
}
