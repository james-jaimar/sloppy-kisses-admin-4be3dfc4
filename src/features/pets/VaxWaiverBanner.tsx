import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "@/components/modals/ModalShell";
import { usePetVaxWaiver, useSetPetVaxWaiver, isWaiverActive } from "./vaxWaiverQueries";

function fmt(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
}
function plusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Admin-only, time-limited vaccination waiver for a pet (paper-records transition). */
export function VaxWaiverBanner({ petId, canManage }: { petId: string; canManage: boolean }) {
  const q = usePetVaxWaiver(petId);
  const save = useSetPetVaxWaiver(petId);
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState(plusDays(60));
  const [reason, setReason] = useState("Vaccination records on file (paper) — awaiting upload");

  const active = isWaiverActive(q.data?.vax_waived_until);

  async function submit(clear = false) {
    try {
      await save.mutateAsync(clear ? { until: null, reason: null } : { until, reason: reason.trim() || null });
      toast.success(clear ? "Waiver removed" : "Vaccination waiver saved");
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save the waiver");
    }
  }

  if (!active && !canManage) return null;

  return (
    <>
      {active ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="font-semibold">Vaccinations waived until {fmt(q.data?.vax_waived_until ?? null)}</span>
            {q.data?.vax_waiver_reason ? <span className="opacity-90"> — {q.data.vax_waiver_reason}</span> : null}
          </div>
          {canManage && (
            <div className="flex gap-2">
              <button
                onClick={() => { setUntil(q.data?.vax_waived_until ?? plusDays(60)); setReason(q.data?.vax_waiver_reason ?? ""); setOpen(true); }}
                className="rounded-lg border border-sk-orange px-2.5 py-1 font-medium hover:bg-white/50"
              >
                Edit
              </button>
              <button onClick={() => submit(true)} disabled={save.isPending}
                className="rounded-lg border border-sk-orange px-2.5 py-1 font-medium hover:bg-white/50 disabled:opacity-50">
                Remove
              </button>
            </div>
          )}
        </div>
      ) : canManage ? (
        <button onClick={() => { setUntil(plusDays(60)); setOpen(true); }}
          className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
          <ShieldCheck className="h-3.5 w-3.5" /> Waive vaccinations
        </button>
      ) : null}

      {open && (
        <ModalShell title="Waive vaccination requirements" onClose={() => setOpen(false)}>
          <div className="space-y-4 p-5 text-sm">
            <p className="text-xs text-muted-foreground">
              While the waiver is active this pet passes every vaccination gate. Use it for pets whose
              certificates are on file on paper but not yet uploaded.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Waived until</span>
              <input type="date" value={until} min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setUntil(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Reason</span>
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm" />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
            <button onClick={() => submit(false)} disabled={save.isPending || !until}
              className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save waiver
            </button>
          </div>
        </ModalShell>
      )}
    </>
  );
}
