import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { useHotelVaccinationGate } from "@/features/settings/hotelRateCardQueries";
import { useHotelWorkflowSettings } from "@/features/hotelCattery/queries";

const STATUS_LABEL: Record<string, string> = {
  missing: "Missing",
  no_expiry: "No expiry recorded",
  expired: "Expired",
  unverified: "Unverified",
  ok: "OK",
};

export function HotelVaxGatePanel({ tenantId, bookingId }: { tenantId: string; bookingId: string }) {
  const gateQ = useHotelVaccinationGate(bookingId);
  const wfQ = useHotelWorkflowSettings(tenantId);
  const mode = wfQ.data?.vax_gate_mode ?? "soft";

  if (mode === "off") return null;
  if (gateQ.isLoading) return null;
  const rows = gateQ.data ?? [];
  const issues = rows.filter((r) => r.status !== "ok");

  if (issues.length === 0) {
    return (
      <div className="sk-card flex items-start gap-3 border-sk-green/40 bg-sk-green-soft/40 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sk-green" />
        <div>
          <div className="font-semibold text-sk-green">Vaccinations OK</div>
          <div className="text-xs text-muted-foreground">
            All required vaccinations are on file and valid for the stay.
          </div>
        </div>
      </div>
    );
  }

  const tone = mode === "hard" ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-sk-orange bg-sk-orange-soft text-sk-orange";
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
              ? "Resolve or override before this booking can be confirmed / checked in."
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
          </li>
        ))}
      </ul>
    </div>
  );
}