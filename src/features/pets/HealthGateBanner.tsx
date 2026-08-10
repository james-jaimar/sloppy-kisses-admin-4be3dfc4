import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import { usePetHealthGate, holdReasonLabel, type HealthGate } from "./healthQueries";

function summarise(gate: HealthGate | undefined) {
  if (!gate) return { blocking: [] as string[], warnings: [] as string[] };
  const blocking: string[] = [];
  const warnings: string[] = [];
  for (const h of gate.holds ?? []) {
    const text = `Not fit to attend — ${holdReasonLabel(h.reason)}${h.notes ? ` (${h.notes})` : ""}`;
    (h.blocks_attendance ? blocking : warnings).push(text);
  }
  for (const t of gate.treatments ?? []) {
    if (t.status === "ok") continue;
    const label =
      t.status === "missing" ? `${t.label}: no treatment on record` :
      t.status === "overdue" ? `${t.label}: overdue since ${t.next_due_date ?? "—"}` :
      `${t.label}: due ${t.next_due_date ?? "—"}`;
    if (t.gate_mode === "block" && (t.status === "missing" || t.status === "overdue")) blocking.push(label);
    else if (t.gate_mode !== "off") warnings.push(label);
  }
  return { blocking, warnings };
}

/** Compact health gate summary for one pet — parasite treatments plus "not fit to attend" holds. */
export function HealthGateBanner({
  petId,
  petName,
  onDate,
  showWhenClear = false,
}: {
  petId: string;
  petName?: string | null;
  onDate?: string;
  showWhenClear?: boolean;
}) {
  const gateQ = usePetHealthGate(petId, onDate);
  const { blocking, warnings } = summarise(gateQ.data);

  if (gateQ.isLoading) return null;
  if (blocking.length === 0 && warnings.length === 0) {
    if (!showWhenClear) return null;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-sk-turquoise bg-sk-turquoise-soft px-3 py-2 text-xs text-sk-turquoise-dark">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        {petName ? `${petName} — ` : ""}health checks up to date.
      </div>
    );
  }

  const isBlocked = blocking.length > 0;
  return (
    <div
      className={
        "rounded-lg border px-3 py-2 text-xs " +
        (isBlocked
          ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark"
          : "border-sk-orange bg-sk-orange-soft text-sk-orange")
      }
    >
      <div className="flex items-center gap-2 font-semibold">
        {isBlocked ? <ShieldAlert className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
        {petName ? `${petName} — ` : ""}
        {isBlocked ? "Not cleared to attend" : "Health checks need attention"}
      </div>
      <ul className="mt-1 list-disc space-y-0.5 pl-6">
        {[...blocking, ...warnings].map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/** Banner for a set of pets, used on booking forms and check-in. */
export function HealthGateList({
  pets,
  onDate,
}: {
  pets: Array<{ id: string; name?: string | null }>;
  onDate?: string;
}) {
  if (pets.length === 0) return null;
  return (
    <div className="space-y-2">
      {pets.map((p) => (
        <HealthGateBanner key={p.id} petId={p.id} petName={pets.length > 1 ? p.name : null} onDate={onDate} />
      ))}
    </div>
  );
}