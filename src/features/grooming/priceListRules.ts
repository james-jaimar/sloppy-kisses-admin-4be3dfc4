/** Standard treatments included in a Full package, never cosmetic colouring. */
export const FULL_GROOM_INCLUDED_CODES = new Set([
  "teeth_gel", "nails_trim", "nail_trim", "ear_clean", "anal_gland", "hygiene_cut",
  "hand_strip", "shampoo_hypo", "shampoo_tick_flea", "shampoo_deshed", "shampoo_whitening",
]);

export function groomingAddonPrice(code: string, price: number, packageType?: string | null) {
  return packageType === "full" && FULL_GROOM_INCLUDED_CODES.has(code) ? 0 : price;
}

export function pensionerEligible(date: Date, days: number[] = [1, 3]) {
  return days.includes(date.getDay());
}

export function mattedOvertimePrice(totalMinutes: number, rate: number, threshold: number) {
  return Math.max(0, Math.ceil((totalMinutes - threshold) / 15)) * rate;
}