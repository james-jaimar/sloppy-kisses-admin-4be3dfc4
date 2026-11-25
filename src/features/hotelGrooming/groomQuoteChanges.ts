/** Price of a groom booked on the hotel checkout day, after the hotel checkout discount. */
export function hotelGroomPrice(listPrice: number, discountPct: number): number {
  const pct = Math.min(100, Math.max(0, discountPct || 0));
  return Math.round(listPrice * (1 - pct / 100) * 100) / 100;
}

/** Grooms added to a stay after its quote was last prepared/sent (still active). */
export function groomsAddedAfterQuote<T extends { created_at: string; status: string }>(
  grooms: T[],
  quoteStamp: string | null | undefined,
): T[] {
  if (!quoteStamp) return [];
  const t = new Date(quoteStamp).getTime();
  return grooms.filter((g) => (g.status === "pending" || g.status === "scheduled") && new Date(g.created_at).getTime() > t);
}
