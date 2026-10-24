export { FULL_GROOM_INCLUDED_CODES, groomingAddonPrice } from "../../../supabase/functions/_shared/grooming-price-list";

export function pensionerEligible(date: Date, days: number[] = [1, 3]) {
  return days.includes(date.getDay());
}

export function mattedOvertimePrice(totalMinutes: number, rate: number, threshold: number) {
  return Math.max(0, Math.ceil((totalMinutes - threshold) / 15)) * rate;
}