import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { WorkSheet, BigButton } from "./WorkSheet";
import { INCIDENT_CATEGORIES, useRaiseIncident, type IncidentCategory, type IncidentSeverity } from "./queries";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

const SEVERITIES: { key: IncidentSeverity; label: string; tone: string }[] = [
  { key: "note", label: "Just a note", tone: "border-border bg-white" },
  { key: "concern", label: "Concern", tone: "border-sk-orange bg-sk-orange-soft text-sk-orange" },
  { key: "urgent", label: "Urgent", tone: "border-destructive bg-destructive/10 text-destructive" },
];

export function IncidentSheet({
  tenantId,
  bookingId,
  petId,
  customerId,
  onClose,
}: {
  tenantId: string;
  bookingId?: string | null;
  petId?: string | null;
  customerId?: string | null;
  onClose: () => void;
}) {
  const { profile } = useCurrentUser();
  const raise = useRaiseIncident(tenantId);
  const [severity, setSeverity] = useState<IncidentSeverity>("concern");
  const [category, setCategory] = useState<IncidentCategory>("injury");
  const [description, setDescription] = useState("");

  async function submit() {
    if (!description.trim()) {
      toast.error("Please describe what happened");
      return;
    }
    try {
      await raise.mutateAsync({
        bookingId: bookingId ?? null,
        petId: petId ?? null,
        customerId: customerId ?? null,
        severity,
        category,
        description: description.trim(),
        raisedBy: profile?.id ?? null,
      });
      toast.success("Incident logged — the office has been notified");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't log the incident");
    }
  }

  return (
    <WorkSheet
      title="Report an incident"
      onClose={onClose}
      footer={
        <BigButton tone="danger" onClick={submit} disabled={raise.isPending}>
          <AlertTriangle className="h-5 w-5" /> {raise.isPending ? "Saving…" : "Log incident"}
        </BigButton>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">How serious?</div>
          <div className="grid gap-2">
            {SEVERITIES.map((s) => (
              <button
                key={s.key}
                onClick={() => setSeverity(s.key)}
                className={`min-h-[56px] rounded-2xl border-2 px-4 text-left text-base font-semibold ${
                  severity === s.key ? s.tone : "border-border bg-white text-muted-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">What kind?</div>
          <div className="grid grid-cols-2 gap-2">
            {INCIDENT_CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`min-h-[56px] rounded-2xl border-2 px-3 text-base font-semibold ${
                  category === c.key ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">What happened?</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder="Describe it in your own words…"
            className="w-full rounded-2xl border border-border p-4 text-base"
          />
        </div>
      </div>
    </WorkSheet>
  );
}