import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCancellationQuote, useCancelBookingWithFee } from "./cancellationQueries";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

const zar = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n || 0);

interface Props {
  tenantId: string;
  bookingId: string;
  bookingNumber?: string | null;
  onClose: () => void;
  onCancelled?: () => void;
}

export function CancelBookingDialog({ tenantId, bookingId, bookingNumber, onClose, onCancelled }: Props) {
  const { hasPermission } = useCurrentUser();
  const quoteQ = useCancellationQuote(bookingId);
  const cancelM = useCancelBookingWithFee(tenantId);
  const [waive, setWaive] = useState(false);
  const [reason, setReason] = useState("");

  const q = quoteQ.data;
  const fee = waive ? 0 : Number(q?.amount ?? 0);
  const canWaive = hasPermission("bookings.waive_fees") || hasPermission("settings.manage");

  async function submit() {
    try {
      const res = await cancelM.mutateAsync({ bookingId, waive, reason });
      toast.success(res.fee > 0 ? `Cancelled — ${zar(res.fee)} fee charged` : "Booking cancelled — no fee");
      onCancelled?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to cancel booking");
    }
  }

  return (
    <ModalShell
      title="Cancel booking"
      subtitle={bookingNumber ?? undefined}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Keep booking
          </button>
          <button
            onClick={submit}
            disabled={cancelM.isPending || quoteQ.isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-60"
          >
            {cancelM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {fee > 0 ? `Cancel & charge ${zar(fee)}` : "Cancel booking"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        {quoteQ.isLoading && <p className="text-muted-foreground">Working out the cancellation fee…</p>}

        {q && (
          <div
            className={
              "rounded-lg border p-3 " +
              (q.applies ? "border-sk-orange bg-sk-orange-soft text-sk-orange" : "border-border bg-muted/40")
            }
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              <AlertTriangle className="h-3.5 w-3.5" />
              {q.applies ? "Inside the cancellation window" : "No cancellation fee"}
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              <li>
                Notice given: <strong>{Math.max(0, Math.round(q.hours_notice))} hours</strong> before the booking
                {q.notice_window_hours > 0 && <> (policy window {Math.round(q.notice_window_hours)} hours)</>}
              </li>
              <li>Booking value: <strong>{zar(q.base)}</strong></li>
              {q.applies && (
                <li>
                  Fee: <strong>{q.percent}%</strong> ={" "}
                  <strong>{zar(q.amount)}</strong>
                  {q.basis === "hotel_deposit_forfeit" && " (deposit forfeited)"}
                </li>
              )}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          The booking's charges are removed from its invoice. If a fee applies it replaces them. Invoices that
          have already been sent or paid are left alone — use a credit note or refund for those.
        </p>

        {q?.applies && canWaive && (
          <label className="flex items-start gap-2 rounded-lg border border-border p-3">
            <input
              type="checkbox"
              checked={waive}
              onChange={(e) => setWaive(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-sk-coral"
            />
            <span>
              <span className="font-medium">Waive the cancellation fee</span>
              <span className="block text-xs text-muted-foreground">Goodwill — nothing will be charged.</span>
            </span>
          </label>
        )}

        <div>
          <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            placeholder="e.g. dog unwell, customer travelling"
          />
        </div>
      </div>
    </ModalShell>
  );
}