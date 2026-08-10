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
 * Late collection: charges the policy late fee, or converts the day into an
 * overnight stay, or waives it entirely. All the money logic lives in the
 * apply_late_collection RPC so the policy settings stay the single source.
 */
export function LateCollectionDialog({ bookingId, bookingNumber, onClose }: Props) {
  const qc = useQueryClient();
  const [collectedAt, setCollectedAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [mode, setMode] = useState<"fee" | "overnight" | "waive">("fee");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("apply_late_collection", {
        p_booking_id: bookingId,
        p_collected_at: new Date(collectedAt).toISOString(),
        p_convert_overnight: mode === "overnight",
        p_waive: mode === "waive",
        p_note: note.trim() || null,
      });
      if (error) throw error;
      const res = (data ?? {}) as any;
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(
        mode === "waive"
          ? "Late collection logged, no charge"
          : res?.amount
            ? `Charged R${Number(res.amount).toFixed(2)}`
            : "Late collection applied",
      );
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not apply late collection");
    } finally {
      setSaving(false);
    }
  }

  const opt = (v: typeof mode, label: string, hint: string) => (
    <label
      key={v}
      className={
        "flex cursor-pointer gap-3 rounded-xl border p-3 text-sm " +
        (mode === v ? "border-sk-coral bg-sk-coral-soft" : "border-border bg-white")
      }
    >
      <input type="radio" checked={mode === v} onChange={() => setMode(v)} className="mt-1" />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );

  return (
    <ModalShell
      title="Late collection"
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
        <div>
          <div className="mb-1 text-sm font-medium">Collected at</div>
          <input
            type="datetime-local"
            value={collectedAt}
            onChange={(e) => setCollectedAt(e.target.value)}
            className="w-full rounded-lg border border-border bg-white p-2.5 text-sm"
          />
        </div>
        <div className="space-y-2">
          {opt("fee", "Charge the late fee", "Uses the policy fee plus the per-15-minute rate")}
          {opt("overnight", "Convert to an overnight stay", "Charges the overnight conversion rate instead")}
          {opt("waive", "Waive this one", "Logs the late collection without charging")}
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
