import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { CalendarClock, X } from "lucide-react";
import { GroomingSlotPicker } from "./GroomingSlotPicker";
import { useGroomingDayAvailability } from "./availabilityQueries";
import { freeResourcesAt } from "./multiPetSchedule";
import { useRescheduleGrooming } from "./queries";

interface Props {
  tenantId: string;
  bookingId: string;
  bookingNumber: string;
  petName?: string | null;
  startAt: string | null;
  endAt: string | null;
  resourceId: string | null;
  mobile?: boolean;
  onClose: () => void;
  onDone?: () => void;
}

function toLocalIso(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

/** Front-desk move: pick a day → free slot → station → confirm. Same save path as diary drag. */
export function RescheduleGroomingDialog({
  tenantId, bookingId, bookingNumber, petName, startAt, endAt, resourceId, mobile, onClose, onDone,
}: Props) {
  const duration = startAt && endAt
    ? Math.max(15, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000))
    : 60;
  const [slot, setSlot] = useState<{ start: string; end: string } | null>(null);
  const [station, setStation] = useState<string | null>(null);
  const move = useRescheduleGrooming(tenantId);

  const dateKey = slot?.start.slice(0, 10) ?? null;
  const availQ = useGroomingDayAvailability(tenantId, dateKey, mobile ? "mobile" : "inhouse");
  const free = useMemo(() => {
    if (!slot || !availQ.data) return [];
    return freeResourcesAt({
      resources: availQ.data.resources,
      busy: availQ.data.busy,
      start: new Date(slot.start),
      end: new Date(slot.end),
      excludeBookingIds: [bookingId],
    }).free;
  }, [slot, availQ.data, bookingId]);
  const chosen = station && free.some((r) => r.id === station)
    ? station
    : free.find((r) => r.id === resourceId)?.id ?? free[0]?.id ?? null;

  async function save() {
    if (!slot) return;
    try {
      await move.mutateAsync({ bookingId, resourceId: chosen, start: new Date(slot.start), end: new Date(slot.end) });
      const name = free.find((r) => r.id === chosen)?.name;
      toast.success(`${petName ?? bookingNumber} moved to ${new Date(slot.start).toLocaleString("en-ZA", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}${name ? ` · ${name}` : ""}`);
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not move the booking");
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-background p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarClock className="h-5 w-5 text-sk-coral" /> Move {petName ?? bookingNumber}</h2>
            <p className="text-xs text-muted-foreground">
              Currently {startAt ? new Date(startAt).toLocaleString("en-ZA", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"} · {duration} min. Pick a day, then a free time.
            </p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <GroomingSlotPicker
          tenantId={tenantId}
          value={slot?.start ?? toLocalIso(startAt)}
          onChange={(s, e) => setSlot(s && e ? { start: s, end: e } : null)}
          durationMinutes={duration}
          kind={mobile ? "mobile" : "inhouse"}
          excludeBookingId={bookingId}
        />

        {slot && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Station</div>
            {free.length === 0 ? (
              <p className="text-sm text-muted-foreground">{availQ.isLoading ? "Checking stations…" : "No station free at that time — pick another slot."}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {free.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setStation(r.id)}
                    className={"rounded-full border px-3 py-1 text-sm font-medium " + (chosen === r.id ? "border-sk-coral bg-sk-coral text-primary-foreground" : "border-border hover:bg-muted")}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-[11px] text-muted-foreground">The customer gets a change confirmation if they accept emails.</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">Cancel</button>
            <button
              onClick={save}
              disabled={!slot || free.length === 0 || move.isPending}
              className="h-10 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-primary-foreground hover:bg-sk-coral-dark disabled:opacity-50"
            >
              {move.isPending ? "Moving…" : "Confirm move"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
