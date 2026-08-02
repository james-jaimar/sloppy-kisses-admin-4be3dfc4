import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

type Kind = "cancel" | "reschedule";

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BookingChangeModal({
  kind,
  bookingId,
  startAt,
  endAt,
  noticeHours,
  onClose,
}: {
  kind: Kind;
  bookingId: string;
  startAt: string;
  endAt?: string | null;
  noticeHours: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [newStart, setNewStart] = useState(toLocalInput(startAt));
  const [newEnd, setNewEnd] = useState(toLocalInput(endAt));

  const hoursAway = (new Date(startAt).getTime() - Date.now()) / 3_600_000;
  const shortNotice = hoursAway < noticeHours;

  const run = useMutation({
    mutationFn: async () => {
      if (kind === "cancel") {
        const { error } = await supabase.rpc("portal_cancel_booking", {
          p_booking_id: bookingId,
          p_reason: reason.trim() || undefined,
        });
        if (error) throw error;
        return;
      }
      const s = new Date(newStart);
      if (isNaN(s.getTime())) throw new Error("Pick a valid new date and time");
      const e = newEnd ? new Date(newEnd) : null;
      const { error } = await supabase.rpc("portal_reschedule_booking", {
        p_booking_id: bookingId,
        p_start_at: s.toISOString(),
        p_end_at: e && !isNaN(e.getTime()) ? e.toISOString() : undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(kind === "cancel" ? "Booking cancelled" : "Booking moved");
      qc.invalidateQueries({ queryKey: ["portal_booking", bookingId] });
      qc.invalidateQueries({ queryKey: ["portal_bookings"] });
      qc.invalidateQueries({ queryKey: ["portal_dash_upcoming"] });
      onClose();
    },
    onError: (e: any) => {
      const m = String(e?.message ?? "");
      toast.error(
        m.includes("not_permitted") ? "You can't change this booking — please contact us."
          : m.includes("past") ? "That booking has already started."
          : m || "Could not update the booking",
      );
    },
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">
            {kind === "cancel" ? "Cancel booking" : "Move booking"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          {shortNotice && (
            <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                This is inside our {noticeHours}-hour notice period, so a late
                {kind === "cancel" ? " cancellation" : " change"} fee may apply. Our team will be in touch.
              </div>
            </div>
          )}

          {kind === "cancel" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Reason (optional)</span>
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm" />
            </label>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">New start</span>
                <input type="datetime-local" value={newStart} onChange={(e) => setNewStart(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">New end (optional)</span>
                <input type="datetime-local" value={newEnd} onChange={(e) => setNewEnd(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm" />
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">Back</button>
          <button onClick={() => run.mutate()} disabled={run.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
            {run.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {kind === "cancel" ? "Cancel booking" : "Move booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
