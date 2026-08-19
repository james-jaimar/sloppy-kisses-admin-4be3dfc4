import { Check, Loader2, LogIn, LogOut, StickyNote, Undo2 } from "lucide-react";
import { StayPlayBadge } from "@/features/daycare/StayPlayBadge";
import type { StayPlaySession } from "@/features/daycare/stayPlayQueries";

export type DaycareStatus = "due" | "in" | "out" | "no_show";

export interface DaycareRowVM {
  key: string;
  pet_id: string;
  customer_id: string;
  pet_name: string;
  customer_name: string;
  plan_name: string | null;
  status: DaycareStatus;
  checked_in_at: string | null;
  checked_out_at: string | null;
  noteCount: number;
  officeFlagCount: number;
  stayPlay: StayPlaySession[];
}

export function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function StatusPill({ row, size = "sm" }: { row: DaycareRowVM; size?: "xs" | "sm" }) {
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-1.5 py-0.5 text-[11px]";
  const map: Record<DaycareStatus, { label: string; tone: string }> = {
    due: { label: "Due", tone: "bg-muted text-muted-foreground" },
    in: { label: `In · ${fmtTime(row.checked_in_at)}`.trim().replace(/·\s*$/, ""), tone: "bg-sk-green-soft text-sk-green" },
    out: { label: `Out · ${fmtTime(row.checked_out_at)}`.trim().replace(/·\s*$/, ""), tone: "bg-sk-turquoise-soft text-sk-turquoise-dark" },
    no_show: { label: "No-show", tone: "bg-sk-orange-soft text-sk-orange" },
  };
  const s = map[row.status];
  return <span className={`inline-flex items-center rounded-full font-semibold ${pad} ${s.tone}`}>{s.label}</span>;
}

interface Props {
  rows: DaycareRowVM[];
  graceMinutes: number;
  savingPetId: string | null;
  canAddNotes: boolean;
  onMark: (row: DaycareRowVM, status: "checked_in" | "checked_out") => void;
  onUndo: (row: DaycareRowVM) => void;
  onNote: (row: DaycareRowVM) => void;
}

/** Compact one-line-per-dog list. Fits many more dogs on a tablet screen. */
export function DaycareWorkList({ rows, graceMinutes, savingPetId, canAddNotes, onMark, onUndo, onNote }: Props) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white">
      {rows.map((r) => {
        const saving = savingPetId === r.pet_id;
        return (
          <li key={r.key} className="flex flex-wrap items-center gap-3 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sk-coral-soft text-sm font-bold text-sk-coral-dark">
              {r.pet_name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-semibold">{r.pet_name}</span>
                <StatusPill row={r} size="xs" />
                <StayPlayBadge sessions={r.stayPlay} graceMinutes={graceMinutes} showOrigin />
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {r.customer_name}{r.plan_name ? ` · ${r.plan_name}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {canAddNotes && (
                <button
                  onClick={() => onNote(r)}
                  aria-label={`Add note for ${r.pet_name}`}
                  className={`relative grid h-11 w-11 place-items-center rounded-xl border border-border active:bg-muted ${
                    r.officeFlagCount > 0 ? "border-sk-orange bg-sk-orange-soft" : ""
                  }`}
                >
                  <StickyNote className="h-4 w-4" />
                  {r.noteCount > 0 && (
                    <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-sk-coral px-1 text-[10px] font-bold text-white">
                      {r.noteCount}
                    </span>
                  )}
                </button>
              )}
              {r.status === "out" ? (
                <button
                  onClick={() => onUndo(r)}
                  disabled={saving}
                  className="flex h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Undo
                </button>
              ) : (
                <>
                  <button
                    onClick={() => onMark(r, "checked_in")}
                    disabled={saving || r.status === "in"}
                    className={`flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold disabled:opacity-100 ${
                      r.status === "in" ? "bg-sk-green-soft text-sk-green" : "bg-sk-green text-white"
                    }`}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : r.status === "in" ? <Check className="h-4 w-4" /> : <LogIn className="h-4 w-4" />} In
                  </button>
                  <button
                    onClick={() => onMark(r, "checked_out")}
                    disabled={saving}
                    className="flex h-11 items-center gap-1.5 rounded-xl bg-sk-turquoise px-3 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <LogOut className="h-4 w-4" /> Out
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
