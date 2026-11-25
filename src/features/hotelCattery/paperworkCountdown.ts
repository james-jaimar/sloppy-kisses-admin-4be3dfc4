export type PaperworkTier = "pending" | "due" | "outstanding" | "critical" | "urgent";

/** Escalation tier for outstanding hotel paperwork by days until check-in. */
export function paperworkTier(daysToArrival: number): PaperworkTier {
  if (daysToArrival <= 7) return "urgent";
  if (daysToArrival <= 14) return "critical";
  if (daysToArrival <= 21) return "outstanding";
  if (daysToArrival <= 30) return "due";
  return "pending";
}

export const PAPERWORK_TIER_META: Record<PaperworkTier, { label: string; className: string }> = {
  pending: { label: "Paperwork pending", className: "bg-sk-surface-muted text-muted-foreground border-border" },
  due: { label: "Paperwork due", className: "bg-sk-orange-soft text-sk-orange border-sk-orange/40" },
  outstanding: { label: "Paperwork outstanding", className: "bg-sk-orange-soft text-sk-orange border-sk-orange font-bold" },
  critical: { label: "CRITICAL: missing paperwork", className: "bg-sk-red-soft text-destructive border-destructive font-bold" },
  urgent: { label: "URGENT: missing paperwork", className: "bg-destructive text-destructive-foreground border-destructive font-extrabold animate-pulse" },
};

/** Whole days from today to arrival, both as yyyy-mm-dd (Johannesburg dates). */
export function daysUntil(arrival: string, today: string): number {
  return Math.round((Date.parse(`${arrival}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
