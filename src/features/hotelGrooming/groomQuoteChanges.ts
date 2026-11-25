/** Price of a groom booked on the hotel checkout day, after the hotel checkout discount. */
export function hotelGroomPrice(listPrice: number, discountPct: number): number {
  const pct = Math.min(100, Math.max(0, discountPct || 0));
  return Math.round(listPrice * (1 - pct / 100) * 100) / 100;
}
