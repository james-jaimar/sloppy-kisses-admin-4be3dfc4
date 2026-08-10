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
 * Failed collection: the van arrived but could not collect the pet (no gate
 * code, nobody home). Charges the policy failed-collection fee and marks the
 * booking as a no-show, or logs it without charging.
 */
export function FailedCollectionDialog({ bookingId, bookingNumber, onClose }: Props) {
  const qc = useQueryClient();
  const [waive, setWaive] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("charge_failed_collection", {
        p_booking_id: bookingId,
        p_note: note.trim() || null,
        p_waive: waive,
      });
      if (error) throw error;
      const res = (data ?? {}) as any;
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(
        waive
          ? "Failed collection logged, no charge"
          : res?.amount
            ? `Charged R${Number(res.amount).toFixed(2)}`
            : "Failed collection applied",
      );
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not log the failed collection");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Failed collection"
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
            {saving ? "Applying…" : "Apply"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Use this when the van arrived but could not collect the pet — no gate code, locked gate or nobody home.
          The booking is marked as a no-show.
        </p>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-white p-3 text-sm">
          <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} className="mt-1" />
          <span>
            <span className="block font-medium">Waive the failed-collection fee</span>
            <span className="block text-xs text-muted-foreground">Logs the trip without charging the customer.</span>
          </span>
        </label>
        <div>
          <div className="mb-1 text-sm font-medium">Note</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. gate code not supplied by 07h00"
            className="w-full rounded-lg border border-border bg-white p-2.5 text-sm"
          />
        </div>
      </div>
    </ModalShell>
  );
}