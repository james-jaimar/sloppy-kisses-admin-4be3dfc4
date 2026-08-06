import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, X } from "lucide-react";
import {
  isoDate,
  useAttendanceForDay,
  useTenantPetsWithOwnersSearch,
  useUpsertAttendance,
} from "./queries";

interface Props {
  tenantId: string;
  day?: Date;
  onClose: () => void;
  onDone?: () => void;
}

export function WalkInDialog({ tenantId, day, onClose, onDone }: Props) {
  const theDay = day ?? new Date();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [petId, setPetId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 220);
    return () => clearTimeout(t);
  }, [term]);

  const petsQ = useTenantPetsWithOwnersSearch(tenantId, debounced);
  const attendanceQ = useAttendanceForDay(tenantId, theDay);
  const upsert = useUpsertAttendance(tenantId);

  const pets = (petsQ.data ?? []) as any[];
  const selected = useMemo(() => pets.find((p) => p.id === petId) ?? null, [pets, petId]);
  const already = (attendanceQ.data ?? []).find((a: any) => a.pet_id === petId) ?? null;

  async function submit() {
    if (!selected) { toast.error("Pick a pet first"); return; }
    if (!selected.customer_id) { toast.error("That pet has no owner on file"); return; }
    if (already) { toast.error(`${selected.name} already has an attendance record today`); return; }
    try {
      const now = new Date().toISOString();
      await upsert.mutateAsync({
        pet_id: selected.id,
        customer_id: selected.customer_id,
        attendance_date: isoDate(theDay),
        status: "walk_in",
        expected: false,
        checked_in_at: now,
        checked_out_at: null,
        notes: notes || null,
      });
      toast.success(`${selected.name} checked in as a walk-in`);
      onDone?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't check the dog in");
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Walk-in check-in</h2>
            <p className="text-xs text-muted-foreground">
              {theDay.toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}
            </p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Customer or pet</label>
            <div className="flex items-center gap-2 rounded-lg border border-border px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Name, SK number, pet…"
                className="h-10 w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border">
              {petsQ.isLoading && (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              )}
              {!petsQ.isLoading && pets.length === 0 && (
                <div className="px-3 py-4 text-sm text-muted-foreground">No matching customer or pet</div>
              )}
              {pets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPetId(p.id)}
                  className={
                    "flex w-full flex-col items-start px-3 py-2 text-left hover:bg-sk-surface-muted " +
                    (p.id === petId ? "bg-sk-coral-soft/40" : "")
                  }
                >
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[p.breed ?? p.species, p.customer?.full_name, p.customer?.customer_number]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {already && (
            <div className="rounded-lg bg-sk-orange/10 px-3 py-2 text-xs font-medium text-sk-orange">
              This pet already has an attendance record today — use the board to change its status.
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Note (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. collecting at 16:00"
              className="h-10 w-full rounded-lg border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sk-coral/40"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!selected || Boolean(already) || upsert.isPending}
            className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {upsert.isPending ? "Checking in…" : "Check in"}
          </button>
        </div>
      </div>
    </div>
  );
}