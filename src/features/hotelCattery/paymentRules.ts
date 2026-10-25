export function hotelPaymentPercent(startDate: string, today: string, cutoff = 30, deposit = 50, override: number | null = null) {
  const days = Math.round((Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today.slice(0, 10)}T00:00:00Z`)) / 86400000);
  return override ?? (days > cutoff ? deposit : 100);
}