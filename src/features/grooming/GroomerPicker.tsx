/**
 * Inline groomer picker used on the booking detail page — change who is doing the
 * dog without opening the edit form. Clashes on the target groomer are refused.
 */
import { useMemo } from "react";
import { toast } from "sonner";
import { useGroomers } from "@/features/settings/resourceQueries";
import { useGroomingBoardBookings, useRescheduleGrooming } from "./queries";

export function GroomerPicker({
  tenantId,
  bookingId,
  resourceId,
  startAt,
  endAt,
}: {
  tenantId: string;
  bookingId: string;
  resourceId: string | null;
  startAt: string | null;
  endAt: string | null;
}) {
  const day = useMemo(() => (startAt ? new Date(startAt) : new Date()), [startAt]);
  const groomersQ = useGroomers(tenantId, { activeOnly: true });
  const dayQ = useGroomingBoardBookings({ tenantId, day });
  const reschedule = useRescheduleGrooming(tenantId);

  const start = startAt ? new Date(startAt) : null;
  const end = endAt ? new Date(endAt) : start ? new Date(start.getTime() + 60 * 60000) : null;

  function busyFor(id: string) {
    if (!start || !end) return null;
    return (dayQ.data ?? []).find((c) => {
      if (c.id === bookingId || c.resource_id !== id || !c.start_at) return false;
      const s = new Date(c.start_at).getTime();
      const e = c.end_at ? new Date(c.end_at).getTime() : s + 60 * 60000;
      return s < end.getTime() && e > start.getTime();
    }) ?? null;
  }

  async function onPick(next: string) {
    if (!start || !end) {
      toast.error("Set a start time before assigning a groomer");
      return;
    }
    const id = next || null;
    if (id) {
      const clash = busyFor(id);
      if (clash) {
        toast.error(`That groomer already has ${clash.pets[0]?.name ?? clash.booking_number} at this time`);
        return;
      }
    }
    try {
      await reschedule.mutateAsync({ bookingId, resourceId: id, start, end });
      toast.success(id ? "Groomer updated" : "Groomer cleared");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not update the groomer");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{
          backgroundColor:
            (groomersQ.data ?? []).find((g) => g.id === resourceId)?.colour ?? "transparent",
          border: resourceId ? undefined : "1px dashed hsl(var(--sk-border-strong))",
        }}
      />
      <select
        value={resourceId ?? ""}
        disabled={reschedule.isPending}
        onChange={(e) => onPick(e.target.value)}
        className="h-9 flex-1 rounded-lg border border-border bg-white px-2 text-sm"
      >
        <option value="">Unassigned</option>
        {(groomersQ.data ?? []).map((g) => {
          const clash = busyFor(g.id);
          return (
            <option key={g.id} value={g.id}>
              {g.name}{clash ? " — busy" : ""}
            </option>
          );
        })}
      </select>
    </div>
  );
}