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

/**
 * Early check-out for a hotel stay. The no-refund policy lives in the
 * hotel_early_checkout RPC, so the invoice keeps whatever the policy says.
 */
export function EarlyCheckoutDialog({ bookingId, bookingNumber, onClose }: Props) {
  const qc = useQueryClient();
  const [collectedAt, setCollectedAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("hotel_early_checkout", {
        p_booking_id: bookingId,
        p_collected_at: new Date(collectedAt).toISOString(),
        p_note: note.trim() || null,
      });
      if (error) throw error;
      const res = (data ?? {}) as any;
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(
        res?.refunded && Number(res.refunded) > 0
          ? `Checked out early, R${Number(res.refunded).toFixed(2)} credited`
          : "Checked out early — full stay remains payable",
      );
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not check the guest out early");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Early check-out"
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
            {saving ? "Checking out…" : "Check out"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Ends the stay before the booked departure date. Whether unused nights are refunded follows the
          early check-out policy in Hotel workflow settings.
        </p>
        <div>
          <div className="mb-1 text-sm font-medium">Collected at</div>
          <input
            type="datetime-local"
            value={collectedAt}
            onChange={(e) => setCollectedAt(e.target.value)}
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