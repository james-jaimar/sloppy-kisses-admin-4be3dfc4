import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Users } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export interface DaycareDayRow {
  day: string;
  expected: number;
  capacity: number | null;
}

/** Expected dogs vs daily capacity, readable by staff and portal customers. */
export function useDaycareDayAvailability(params: {
  tenantId: string | null | undefined;
  start: string | null;
  end: string | null;
  enabled?: boolean;
}) {
  const { tenantId, start, end, enabled = true } = params;
  return useQuery({
    queryKey: ["daycare_day_availability", tenantId, start, end],
    enabled: Boolean(tenantId && start && end && enabled),
    queryFn: async (): Promise<DaycareDayRow[]> => {
      const { data, error } = await supabase.rpc("daycare_day_availability" as any, {
        p_tenant_id: tenantId as string,
        p_start: start as string,
        p_end: end as string,
      } as any);
      if (error) throw error;
      return (data ?? []) as DaycareDayRow[];
    },
  });
}

export function daycareDayFull(rows: DaycareDayRow[] | undefined, petCount: number) {
  if (!rows?.length || petCount <= 0) return false;
  return rows.some(
    (r) => r.capacity != null && Number(r.capacity) > 0 && Number(r.expected) + petCount > Number(r.capacity),
  );
}

export function DaycareCapacityNotice({
  rows,
  petCount,
  blocked,
  loading,
}: {
  rows: DaycareDayRow[] | undefined;
  petCount: number;
  blocked: boolean;
  loading?: boolean;
}) {
  if (loading || !rows?.length || petCount <= 0) return null;
  const row = rows[0];
  if (row?.capacity == null || Number(row.capacity) <= 0) return null;
  const remaining = Number(row.capacity) - Number(row.expected);

  if (remaining >= petCount) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        {remaining} of {row.capacity} daycare spaces open on this day.
      </div>
    );
  }

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
        <div className="font-semibold">Daycare is full on this day</div>
        <div className="opacity-90">
          {blocked
            ? "Please choose another day — we're at our daily limit."
            : "We're at our daily limit; we'll confirm space with you."}
        </div>
      </div>
    </div>
  );
}
