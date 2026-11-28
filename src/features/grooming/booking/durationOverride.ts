/** Each pet's extra handling time is charged independently using the workflow rate. */
export function groomingDurationPrice(baseMinutes: number, durationOverride: number | null | undefined, surchargeOverride: number | null | undefined, ratePer15Minutes: number) {
  const durationMinutes = durationOverride ?? baseMinutes;
  const extraMinutes = Math.max(0, durationMinutes - baseMinutes);
  const suggestedSurcharge = Math.ceil(extraMinutes / 15) * ratePer15Minutes;
  return { durationMinutes, extraMinutes, suggestedSurcharge, mattedSurchargeZar: surchargeOverride ?? suggestedSurcharge };
}