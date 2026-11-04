export function groomingInvoiceReleaseDay(serviceDay: string, mode: string, leadDays: number, today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())) {
  if (mode === "at_booking") return today;
  const date = new Date(`${serviceDay}T12:00:00Z`);
  if (mode === "days_before") date.setUTCDate(date.getUTCDate() - leadDays);
  const release = date.toISOString().slice(0, 10);
  return release < today ? today : release;
}