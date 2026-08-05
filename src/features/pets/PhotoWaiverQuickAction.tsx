import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "@/components/modals/ModalShell";
import { usePetPhotoWaiver, useSetPetPhotoWaiver, isPhotoWaiverActive } from "./photoGateQueries";

function plusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
}

/** Compact "Waive" control for the booking photo gate panel. */
export function PhotoWaiverQuickAction({ petId, petName }: { petId: string; petName: string }) {
  const q = usePetPhotoWaiver(petId);
  const save = useSetPetPhotoWaiver(petId);
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState(plusDays(30));
  const [reason, setReason] = useState("Staff know this pet — photo to be taken at check-in");

  const active = isPhotoWaiverActive(q.data?.photo_waived_until);

  async function submit(clear = false) {
    try {
      await save.mutateAsync(clear ? { until: null, reason: null } : { until, reason: reason.trim() || null });
      toast.success(clear ? `Photo waiver removed for ${petName}` : `Photo requirement waived for ${petName}`);
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save the waiver");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setUntil(q.data?.photo_waived_until ?? plusDays(30));
          if (q.data?.photo_waiver_reason) setReason(q.data.photo_waiver_reason);
          setOpen(true);
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-current px-2 py-0.5 text-[11px] font-semibold hover:bg-white/60"
      >
        <ShieldCheck className="h-3 w-3" /> {active ? "Waiver" : "Waive"}
      </button>

      {open && (
        <ModalShell
          title={`Waive pet photo — ${petName}`}
          onClose={() => setOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              {active && (
                <button
                  onClick={() => submit(true)}
                  disabled={save.isPending}
                  className="mr-auto rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
                >
                  Remove waiver
                </button>
              )}
              <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">
                Cancel
              </button>
              <button
                onClick={() => submit(false)}
                disabled={save.isPending || !until}
                className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
              >
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save waiver
              </button>
            </div>
          }
        >
          <div className="space-y-4 p-5 text-sm">
            <p className="text-xs text-muted-foreground">
              While the waiver is active, {petName} passes the pet-photo check on every booking. Use it for pets staff
              already recognise, and take the photo at check-in.
            </p>
            {active && (
              <div className="rounded-lg bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
                Currently waived until {fmt(q.data?.photo_waived_until)}.
              </div>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Waived until</span>
              <input
                type="date"
                value={until}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setUntil(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Reason</span>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        </ModalShell>
      )}
    </>
  );
}