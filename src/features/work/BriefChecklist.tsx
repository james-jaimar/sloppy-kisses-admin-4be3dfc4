import { useEffect } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { briefColour, briefIcon } from "@/features/grooming/instructions/briefIcons";
import { useBriefChecks, useToggleBriefCheck } from "@/features/grooming/instructions/queries";
import type { BriefRow } from "./briefRows";

/**
 * The styling brief as a tap-to-confirm worklist: one big icon row per instruction,
 * colour-coded, with a tick the groomer must set once they've done it.
 */
export function BriefChecklist({
  tenantId,
  bookingId,
  petId,
  rows,
  readOnly,
  onProgress,
}: {
  tenantId: string;
  bookingId: string;
  petId: string | null;
  rows: BriefRow[];
  readOnly?: boolean;
  onProgress?: (p: { done: number; total: number }) => void;
}) {
  const checksQ = useBriefChecks(bookingId);
  const toggle = useToggleBriefCheck(tenantId);

  const byCode = new Map((checksQ.data ?? []).filter((c) => (c.pet_id ?? null) === petId).map((c) => [c.group_code, c]));
  const doneCount = rows.filter((r) => byCode.get(r.code)?.done).length;

  // Report progress up so the job page can nudge before sign-off.
  const total = rows.length;
  useEffect(() => {
    onProgress?.({ done: doneCount, total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneCount, total]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tick each one off as you go
        </span>
        <span className="text-sm font-bold">
          {doneCount}/{rows.length} done
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => {
          const check = byCode.get(row.code);
          const done = Boolean(check?.done);
          const c = briefColour(row.colour);
          const Icon = briefIcon(row.icon);
          return (
            <li key={row.code}>
              <button
                type="button"
                disabled={readOnly || toggle.isPending}
                onClick={() =>
                  toggle
                    .mutateAsync({
                      bookingId,
                      petId,
                      groupCode: row.code,
                      done: !done,
                      existingId: check?.id ?? null,
                    })
                    .catch((e: any) => toast.error(e?.message ?? "Couldn't save that tick"))
                }
                className={`flex min-h-[68px] w-full items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left disabled:opacity-60 ${
                  done ? "border-sk-green bg-sk-green-soft" : `${c.ring} bg-white`
                }`}
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${c.chip}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {row.label}
                  </span>
                  <span className={`block text-base font-bold ${done ? "text-sk-green" : ""}`}>{row.value}</span>
                </span>
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 ${
                    done ? "border-sk-green bg-sk-green text-white" : "border-border"
                  }`}
                  aria-hidden
                >
                  {done && <Check className="h-5 w-5" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
