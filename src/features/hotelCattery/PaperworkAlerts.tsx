import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileWarning, ChevronDown, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBookingPeekClick } from "@/features/bookings/BookingPeek";
import { cn } from "@/lib/utils";
import { PAPERWORK_TIER_META, daysUntil, paperworkTier } from "./paperworkCountdown";

export type PaperworkAlert = { booking_id: string; booking_number: string | null; start_date: string; customer_name: string | null; pet_names: string | null; issues: string[] };

const todayJhb = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });

export function usePaperworkAlerts(tenantId: string | null) {
  return useQuery({
    queryKey: ["hotel_paperwork_alerts", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("hotel_paperwork_alerts", { p_tenant_id: tenantId, p_days: 60 });
      if (error) throw error;
      return (data ?? []) as PaperworkAlert[];
    },
  });
}

export function PaperworkChip({ startDate, className }: { startDate: string; className?: string }) {
  const days = daysUntil(startDate, todayJhb());
  const meta = PAPERWORK_TIER_META[paperworkTier(days)];
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs", meta.className, className)}>
    <FileWarning className="h-3.5 w-3.5" />{meta.label} · {days <= 0 ? "today" : `${days}d`}
  </span>;
}

/** Board banner: confirmed stays still missing paperwork, nearest arrival first. */
export function PaperworkAlertsBanner({ tenantId }: { tenantId: string | null }) {
  const q = usePaperworkAlerts(tenantId);
  const [open, setOpen] = useState(false);
  const peek = useBookingPeekClick();
  const rows = (q.data ?? []).filter(a => daysUntil(a.start_date, todayJhb()) <= 30);
  if (q.error) return <p role="alert" className="text-sm text-destructive">Paperwork alerts could not be loaded.</p>;
  if (!rows.length) return null;
  const urgent = rows.filter(a => daysUntil(a.start_date, todayJhb()) <= 14).length;
  return <section aria-label="Paperwork alerts" className={cn("rounded-xl border-2 px-4 py-3", urgent ? "border-destructive bg-sk-red-soft" : "border-sk-orange bg-sk-orange-soft")}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)} className="flex w-full items-center gap-2 text-left font-bold">
      <FileWarning className="h-5 w-5" />Paperwork needed before arrival · {rows.length} {rows.length === 1 ? "stay" : "stays"}{urgent ? ` (${urgent} within 14 days)` : ""}
      <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold">{open ? "Hide" : "Show"}<ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} /></span>
    </button>
    {open && <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
      {rows.map(a => <li key={a.booking_id} className="flex flex-wrap items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm">
        <PaperworkChip startDate={a.start_date} />
        <Link to={`/admin/bookings/${a.booking_id}`} state={{ from: "/admin/hotel-cattery" }} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90" title="Open the full stay to complete paperwork">{a.booking_number ?? "Open stay"} <ExternalLink className="h-3.5 w-3.5" /></Link>
        <Link to={`/admin/bookings/${a.booking_id}`} onClick={peek(a.booking_id)} className="font-semibold hover:underline">{a.pet_names ?? "Pet"} · {a.customer_name || "—"}</Link>
        <span className="text-muted-foreground">arrives {new Date(`${a.start_date}T12:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}</span>
        <span className="basis-full text-xs text-muted-foreground">Outstanding: {a.issues.join(" · ")}</span>
      </li>)}
    </ul>}
  </section>;
}
