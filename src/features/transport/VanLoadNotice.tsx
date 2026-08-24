import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export interface VanLoadRow {
  resource_id: string;
  resource_name: string;
  day: string;
  stops: number;
  max_stops: number;
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Per-van stop counts for a date range, used to stop the run being overloaded. */
export function useTransportDayLoad(params: {
  tenantId: string | null | undefined;
  date: string | null;
  excludeBookingId?: string | null;
  enabled?: boolean;
}) {
  const { tenantId, date, excludeBookingId = null, enabled = true } = params;
  const end = date ? isoDate(new Date(new Date(`${date}T00:00:00`).getTime() + 86400000)) : null;
  return useQuery({
    queryKey: ["transport_day_load", tenantId, date, excludeBookingId],
    enabled: Boolean(tenantId && date && enabled),
    queryFn: async (): Promise<VanLoadRow[]> => {
      const { data, error } = await supabase.rpc("transport_day_load" as any, {
        p_tenant_id: tenantId as string,
        p_start: date as string,
        p_end: end as string,
        p_exclude_booking_id: excludeBookingId,
      } as any);
      if (error) throw error;
      return (data ?? []) as VanLoadRow[];
    },
  });
}

/** True when every van already has a full day. */
export function isRunFull(rows: VanLoadRow[] | undefined) {
  if (!rows?.length) return false;
  return rows.every((r) => Number(r.stops) >= Number(r.max_stops));
}

export function VanLoadNotice({
  rows,
  mode,
  loading,
}: {
  rows: VanLoadRow[] | undefined;
  mode: "warn" | "block";
  loading?: boolean;
}) {
  if (loading || !rows?.length) return null;
  const full = isRunFull(rows);
  const freeVans = rows.filter((r) => Number(r.stops) < Number(r.max_stops));

  if (!full) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Truck className="h-3.5 w-3.5" />
        {freeVans.length} of {rows.length} vans still have space on this day.
      </div>
    );
  }

  const blocked = mode === "block";
  return (
    <div
      className={
        "flex items-start gap-2 rounded-lg border p-3 text-xs " +
        (blocked
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-sk-orange bg-sk-orange-soft text-sk-orange")
      }
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        <div className="font-semibold">Every van is fully booked on this day</div>
        <div className="opacity-90">
          {blocked
            ? "Please choose another day for the collection."
            : "Adding this trip will push a run over its planned stops."}
        </div>
      </div>
    </div>
  );
}
