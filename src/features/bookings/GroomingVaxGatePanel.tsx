import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { useGroomingVaccinationGate, useGroomingWorkflowSettings } from "@/features/grooming/workflowQueries";
import { VaxWaiverQuickAction } from "@/features/pets/VaxWaiverQuickAction";

const STATUS_LABEL: Record<string, string> = {
  missing: "Missing",
  no_expiry: "No expiry recorded",
  expired: "Expired",
  unverified: "Unverified",
  waived: "Waived",
  ok: "OK",
};

export function GroomingVaxGatePanel({ tenantId, bookingId }: { tenantId: string; bookingId: string }) {
  const gateQ = useGroomingVaccinationGate(bookingId);
  const wfQ = useGroomingWorkflowSettings(tenantId);
  const mode = wfQ.data?.vax_gate_mode ?? "soft";

  if (mode === "off") return null;
  if (gateQ.isLoading) return null;
  const rows = gateQ.data ?? [];
  const waived = rows.filter((r) => r.status === "waived");
  const issues = rows.filter((r) => r.status !== "ok" && r.status !== "waived");

  if (issues.length === 0) {
    const waivedUntil = waived.map((r) => r.expiry_date).filter(Boolean).sort()[0] ?? null;
    const waivedPets = [...new Map(waived.map((r) => [r.pet_id, r])).values()];
    return (
      <div className="sk-card flex items-start gap-3 border-sk-green/40 bg-sk-green-soft/40 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sk-green" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sk-green">
            {waived.length ? "Vaccinations OK (waiver in place)" : "Vaccinations OK"}
          </div>
          <div className="text-xs text-muted-foreground">
            {waived.length
              ? `An admin waiver covers ${[...new Set(waived.map((r) => r.pet_name))].join(", ")}${waivedUntil ? ` until ${waivedUntil}` : ""}.`
              : "All required vaccinations are on file and valid."}
          </div>
          {waivedPets.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-sk-green">
              {waivedPets.map((r) => (
                <VaxWaiverQuickAction key={r.pet_id} petId={r.pet_id} petName={r.pet_name} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const tone = mode === "hard"
    ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark"
    : "border-sk-orange bg-sk-orange-soft text-sk-orange";
  const Icon = mode === "hard" ? ShieldAlert : AlertTriangle;

  return (
    <div className={"sk-card flex flex-col gap-3 border p-4 text-sm " + tone}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">
            {mode === "hard" ? "Check-in blocked — vaccinations incomplete" : "Vaccination warning"}
          </div>
          <div className="text-xs opacity-90">
            {mode === "hard"
              ? "Resolve or override before this grooming booking can be confirmed / checked in."
              : "Confirm before check-in and log an override if you're proceeding anyway."}
          </div>
        </div>
      </div>
      <ul className="rounded-lg bg-white/60 p-2 text-xs">
        {issues.map((r, i) => (
          <li key={i} className="flex items-center justify-between gap-2 border-b border-white/60 py-1 last:border-0">
            <span className="font-medium">{r.pet_name}</span>
            <span>{r.vaccine_type}</span>
            <span className="rounded bg-white px-2 py-0.5 font-semibold">{STATUS_LABEL[r.status] ?? r.status}</span>
            <span className="text-muted-foreground">{r.expiry_date ?? "—"}</span>
            <VaxWaiverQuickAction petId={r.pet_id} petName={r.pet_name} />
          </li>
        ))}
      </ul>
    </div>
  );
}