import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { ModalShell } from "@/components/modals/ModalShell";

interface Props {
  bookingId: string;
  bookingNumber?: string | null;
  onClose: () => void;
}

/** Charges Deli food supplied by the hotel when the owner did not send enough. */
export function ExtraFoodDialog({ bookingId, bookingNumber, onClose }: Props) {
  const qc = useQueryClient();
  const [days, setDays] = useState(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("charge_hotel_extra_food", {
        p_booking_id: bookingId,
        p_days: days,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      const res = (data ?? {}) as any;
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(res?.amount ? `Charged R${Number(res.amount).toFixed(2)}` : "Extra food charged");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not charge extra food");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Charge extra food"
      subtitle={bookingNumber ?? undefined}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Charging…" : "Charge"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Use when the owner did not send enough food and the Deli supplied it. The daily fee comes from
          Hotel workflow settings.
        </p>
        <div>
          <div className="mb-1 text-sm font-medium">Days supplied</div>
          <input
            type="number"
            min={0.5}
            step="0.5"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-white p-2.5 text-sm"
          />
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">Note</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-white p-2.5 text-sm"
          />
        </div>
      </div>
    </ModalShell>
  );
}