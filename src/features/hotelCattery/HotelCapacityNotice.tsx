import { useEffect, useMemo } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useHotelDayAvailability, useHotelWorkflowSettings, type OverbookingMode } from "./queries";

export interface CapacityIssue {
  mode: OverbookingMode;
  nights: string[];      // 'YYYY-MM-DD' nights that would exceed capacity
  resourceName: string;
  capacity: number;
}

function fmtNight(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
}

/**
 * Shows per-night space usage for the selected hotel/cattery area and reports
 * any nights this booking would push past capacity. Capacity comes from
 * `resources.capacity` (pens/spaces) via the `hotel_day_availability` RPC.
 */
export function HotelCapacityNotice({
  tenantId, resourceId, startAt, endAt, petCount, excludeBookingId, onIssueChange,
}: {
  tenantId: string | null;
  resourceId: string | null;
  startAt: string | null;   // ISO
  endAt: string | null;     // ISO
  petCount: number;
  excludeBookingId?: string | null;
  onIssueChange?: (issue: CapacityIssue | null) => void;
}) {
  const settingsQ = useHotelWorkflowSettings(tenantId);
  const mode: OverbookingMode = settingsQ.data?.overbooking_mode ?? "warn";

  const start = startAt ? new Date(startAt) : null;
  const end = endAt ? new Date(endAt) : null;

  const availQ = useHotelDayAvailability({
    tenantId,
    start,
    end,
    excludeBookingId: excludeBookingId ?? null,
    enabled: Boolean(resourceId && start && end),
  });

  const rows = useMemo(
    () => (availQ.data ?? []).filter((r) => r.resource_id === resourceId),
    [availQ.data, resourceId],
  );

  const pets = Math.max(1, petCount);
  const over = useMemo(
    () => rows.filter((r) => r.capacity != null && r.used + pets > (r.capacity as number)),
    [rows, pets],
  );

  const resourceName = rows[0]?.resource_name ?? "";
  const capacity = rows[0]?.capacity ?? 0;

  useEffect(() => {
    if (!onIssueChange) return;
    onIssueChange(over.length ? { mode, nights: over.map((r) => r.day), resourceName, capacity } : null);
  }, [over, mode, resourceName, capacity, onIssueChange]);

  if (!resourceId || !start || !end) return null;
  if (availQ.isLoading || !rows.length) return null;
  if (rows.every((r) => r.capacity == null)) {
    return (
      <div className="mt-2 text-[11px] text-muted-foreground">
        No pens/spaces set for this area — occupancy limits aren't enforced. Set it under Settings → Resources.
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {rows.map((r) => {
          const used = r.used + pets;
          const cap = r.capacity ?? 0;
          const full = cap > 0 && used > cap;
          return (
            <span
              key={r.day}
              className={`rounded-md border px-2 py-0.5 text-[11px] tabular-nums ${
                full
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : used === cap
                    ? "border-sk-orange bg-sk-orange-soft text-sk-orange"
                    : "border-border text-muted-foreground"
              }`}
              title={`${fmtNight(r.day)} — ${used} of ${cap} spaces used with this booking`}
            >
              {fmtNight(r.day)} {used}/{cap}
            </span>
          );
        })}
      </div>
      {over.length ? (
        <div className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${
          mode === "block"
            ? "border-destructive bg-destructive/10 text-destructive"
            : "border-sk-orange bg-sk-orange-soft text-sk-orange"
        }`}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            {resourceName} is full on{" "}
            <span className="font-semibold">{over.map((r) => fmtNight(r.day)).join(", ")}</span>.{" "}
            {mode === "block"
              ? "Overbooking is blocked — pick another area or change the dates."
              : "You can still save — you'll be asked to confirm."}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[11px] text-sk-green">
          <CheckCircle2 className="h-3.5 w-3.5" /> Space available for every night.
        </div>
      )}
    </div>
  );
}
