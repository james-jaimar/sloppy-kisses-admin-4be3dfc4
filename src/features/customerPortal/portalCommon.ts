export const SERVICE_LABEL: Record<string, string> = {
  daycare: "Daycare",
  daycare_assessment: "Daycare assessment",
  hotel_dog: "Dog hotel",
  hotel_cat: "Cattery",
  grooming_inhouse: "In-house grooming",
  grooming_mobile: "Mobile grooming",
  pickup_dropoff: "Pick up / drop off",
};

export const SERVICE_OPTIONS: { value: string; label: string }[] = Object.entries(SERVICE_LABEL)
  .map(([value, label]) => ({ value, label }));

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

export function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (["confirmed", "completed", "checked_out", "paid"].includes(s)) return "bg-sk-green-soft text-sk-green";
  if (["requested", "pending", "draft"].includes(s)) return "bg-muted text-muted-foreground";
  if (["cancelled", "no_show", "overdue"].includes(s)) return "bg-sk-coral-soft text-sk-coral-dark";
  if (["checked_in", "in_progress", "in_van", "issued", "sent"].includes(s)) return "bg-sk-turquoise-soft text-sk-turquoise-dark";
  return "bg-sk-orange-soft text-sk-orange";
}