export interface HotelExtraRequest { code: string; quantity: number }
export interface HotelExtraRate { id?: string; code: string; name: string; price_zar: number; per_night: boolean }

/** Requests are per pet; persisted quantities are totals across the selected pets.
 *  Walks are a dog-only extra: pass dogCount so cats on mixed stays are not charged. */
export function priceHotelExtras(catalog: HotelExtraRate[], requests: HotelExtraRequest[], petCount: number, nights: number, checkOutWindow?: string | null, dogCount?: number) {
  const quantities = new Map<string, number>();
  for (const request of requests) {
    if (!Number.isInteger(request.quantity) || request.quantity < 1 || request.quantity > 100 || quantities.has(request.code)) {
      throw new Error("Please choose whole-number quantities without duplicate extras.");
    }
    if (!catalog.some(rate => rate.code === request.code)) throw new Error("An extra is no longer available. Please refresh and choose again.");
    quantities.set(request.code, request.quantity);
  }
  if (checkOutWindow !== undefined) {
    if ((checkOutWindow ?? "").startsWith("Stay & Play")) {
      if (!catalog.some(rate => rate.code === "late_checkout")) throw new Error("Stay & Play is not available. Please contact us about late collection.");
      quantities.set("late_checkout", 1);
    } else quantities.delete("late_checkout");
  }
  return catalog.flatMap(rate => {
    const perPet = quantities.get(rate.code) ?? 0;
    if (!perPet || !petCount) return [];
    const quantity = perPet * petCount;
    const totalWalks = /walk/i.test(rate.code);
    const billedQuantity = quantity * (rate.per_night && !totalWalks ? nights : 1);
    return [{ ...rate, per_night: rate.per_night && !totalWalks, quantity_basis: totalWalks ? "total" : "catalog", perPet, quantity, billedQuantity, total: Math.round(Number(rate.price_zar) * billedQuantity * 100) / 100 }];
  });
}