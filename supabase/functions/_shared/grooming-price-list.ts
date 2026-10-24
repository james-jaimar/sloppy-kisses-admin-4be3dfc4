/** Included standard treatments; colouring, painted nails and overtime remain extras. */
export const FULL_GROOM_INCLUDED_CODES = new Set([
  "teeth_gel", "nails_trim", "nail_trim", "ear_clean", "anal_gland", "hygiene_cut",
  "hand_strip", "shampoo_hypo", "shampoo_tick_flea", "shampoo_deshed", "shampoo_whitening",
]);

export function groomingAddonPrice(code: string, price: number, packageType?: string | null) {
  return packageType === "full" && FULL_GROOM_INCLUDED_CODES.has(code) ? 0 : price;
}