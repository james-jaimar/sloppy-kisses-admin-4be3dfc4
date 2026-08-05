import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Scissors } from "lucide-react";
import { ModalShell } from "@/components/modals/ModalShell";
import { GroomingSlotPicker } from "@/features/grooming/GroomingSlotPicker";
import { useGroomingPackages } from "@/features/settings/groomingRateCardQueries";
import { useScheduleHotelGroom, type HotelGroomRequest } from "./queries";

function addMinutes(isoLocal: string, minutes: number) {
  const d = new Date(isoLocal);
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export function ScheduleHotelGroomDialog({
  tenantId,
  request,
  open,
  onClose,
}: {
  tenantId: string | null;
  request: HotelGroomRequest & { petLabel?: string };
  open: boolean;
  onClose: () => void;
}) {
  const packagesQ = useGroomingPackages(tenantId, { activeOnly: true });
  const schedule = useScheduleHotelGroom();
  const [packageId, setPackageId] = useState<string>("");
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const minutes = useMemo(() => {
    const p = (packagesQ.data ?? []).find((x) => x.id === packageId);
    return p?.expected_minutes ?? 60;
  }, [packagesQ.data, packageId]);

  const windowLabel =
    request.window_start && request.window_end
      ? `${request.window_start} → ${request.window_end}`
      : "the stay";

  const inWindow =
    !start ||
    ((!request.window_start || start.slice(0, 10) >= request.window_start) &&
      (!request.window_end || start.slice(0, 10) <= request.window_end));

  async function save() {
    if (!start) {
      toast.error("Pick a slot inside the stay");
      return;
    }
    if (!inWindow) {
      toast.error(`Slot must fall inside ${windowLabel}`);
      return;
    }
    try {
      await schedule.mutateAsync({
        requestId: request.id,
        startAt: new Date(start).toISOString(),
        endAt: new Date(end ?? addMinutes(start, minutes)).toISOString(),
        packageId: packageId || null,
        notes: notes.trim() || null,
      });
      toast.success("Groom scheduled inside the stay");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to schedule groom");
    }
  }

  if (!open) return null;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={`Schedule groom — ${request.petLabel ?? request.pet_name ?? "pet"}`}
      description={`Choose a slot inside the hotel stay (${windowLabel}).`}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-10 rounded-xl border border-border bg-white px-4 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={schedule.isPending || !start}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
          >
            <Scissors className="h-4 w-4" /> Schedule groom
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {request.customer_notes && (
          <div className="rounded-xl border border-border bg-sk-surface-muted p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Customer notes
            </div>
            <p className="mt-1 whitespace-pre-wrap">{request.customer_notes}</p>
          </div>
        )}

        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Package
          </div>
          <select
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
          >
            <option value="">Decide later</option>
            {(packagesQ.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.expected_minutes} min
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Slot
          </div>
          <GroomingSlotPicker
            tenantId={tenantId}
            value={start}
            durationMinutes={minutes}
            onChange={(s, e) => {
              setStart(s);
              setEnd(e);
            }}
          />
          {!inWindow && (
            <p className="mt-2 text-xs text-sk-coral-dark">
              That slot is outside the stay ({windowLabel}).
            </p>
          )}
        </div>

        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Staff notes
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-white p-3 text-sm"
            placeholder="e.g. groom on checkout morning, collect after 09:30"
          />
        </label>
      </div>
    </ModalShell>
  );
}
