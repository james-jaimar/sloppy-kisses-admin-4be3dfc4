import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { VaxWaiverQuickAction } from "@/features/pets/VaxWaiverQuickAction";
import {
  VAX_STATUS_LABEL,
  VaxGateRow,
  isVaxOutstanding,
  useBookingVaccinationGate,
  usePetsVaccinationStatus,
} from "@/features/pets/vaccinationGate";

/** Shared vaccination compliance panel. Staff can override, customers cannot. */
export function VaccinationGatePanel({
  rows,
  loading,
  mode = "staff",
  bookingId,
  overriddenBy,
  overrideReason,
  compact,
}: {
  rows: VaxGateRow[];
  loading?: boolean;
  mode?: "staff" | "portal";
  bookingId?: string | null;
  overriddenBy?: string | null;
  overrideReason?: string | null;
  compact?: boolean;
}) {
  if (loading) return null;
  const waived = rows.filter((r) => r.status === "waived");
  const issues = rows.filter((r) => isVaxOutstanding(r.status));

  if (rows.length === 0) return null;

  if (issues.length === 0) {
    const waivedPets = [...new Map(waived.map((r) => [r.pet_id, r])).values()];
    return (
      <div className="sk-card flex items-start gap-3 border-sk-green/40 bg-sk-green-soft/40 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sk-green" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sk-green">
            {waived.length ? "Vaccinations OK (waiver in place)" : "Vaccinations up to date"}
          </div>
          <div className="text-xs text-muted-foreground">
            {waived.length
              ? `An admin waiver covers ${[...new Set(waived.map((r) => r.pet_name))].join(", ")}.`
              : "All required certificates are on file, dated and valid."}
          </div>
          {mode === "staff" && waivedPets.length > 0 && (
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

  const blocked = mode === "portal";
  const tone = blocked
    ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark"
    : "border-sk-orange bg-sk-orange-soft text-sk-orange";
  const Icon = blocked ? ShieldAlert : AlertTriangle;

  return (
    <div className={"sk-card flex flex-col gap-3 border p-4 text-sm " + tone}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">
            {blocked ? "Vaccinations needed before you can book" : "Vaccination warning"}
          </div>
          <div className="text-xs opacity-90">
            {blocked
              ? "Upload the certificate and add the date it was given and its expiry, then try again."
              : "You can proceed, but log an override so we know why."}
          </div>
        </div>
      </div>
      {!compact && (
        <ul className="rounded-lg bg-white/70 p-2 text-xs">
          {issues.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/70 py-1 last:border-0">
              <span className="font-medium">{r.pet_name}</span>
              <span>{r.label || r.vaccine_type}</span>
              <span className="rounded bg-white px-2 py-0.5 font-semibold">
                {VAX_STATUS_LABEL[r.status] ?? r.status}
              </span>
              <span className="text-muted-foreground">{r.expiry_date ?? "—"}</span>
              {mode === "staff" && <VaxWaiverQuickAction petId={r.pet_id} petName={r.pet_name} />}
            </li>
          ))}
        </ul>
      )}
      {mode === "staff" && bookingId && (
        <VaxOverrideControl bookingId={bookingId} overriddenBy={overriddenBy} overrideReason={overrideReason} />
      )}
    </div>
  );
}

function VaxOverrideControl({
  bookingId,
  overriddenBy,
  overrideReason,
}: {
  bookingId: string;
  overriddenBy?: string | null;
  overrideReason?: string | null;
}) {
  const { profile, hasPermission } = useCurrentUser();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const canOverride = hasPermission("bookings.manage");

  const save = useMutation({
    mutationFn: async (clear: boolean) => {
      const { error } = await supabase
        .from("bookings")
        .update(
          clear
            ? { vax_override_by: null, vax_override_at: null, vax_override_reason: null }
            : {
                vax_override_by: profile?.id ?? null,
                vax_override_at: new Date().toISOString(),
                vax_override_reason: reason.trim(),
              },
        )
        .eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      setReason("");
      qc.invalidateQueries({ queryKey: ["booking_detail"] });
      qc.invalidateQueries({ queryKey: ["booking_vax_gate", bookingId] });
      toast.success("Override updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save override"),
  });

  if (overriddenBy) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-xs">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span className="font-semibold">Override logged</span>
        {overrideReason && <span className="text-muted-foreground">— {overrideReason}</span>}
        {canOverride && (
          <button
            onClick={() => save.mutate(true)}
            disabled={save.isPending}
            className="ml-auto rounded border border-border bg-white px-2 py-1 font-medium hover:bg-muted"
          >
            Remove override
          </button>
        )}
      </div>
    );
  }

  if (!canOverride) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-xs">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for override"
        className="h-8 flex-1 min-w-[12rem] rounded border border-border bg-white px-2"
      />
      <button
        disabled={!reason.trim() || save.isPending}
        onClick={() => save.mutate(false)}
        className="rounded-lg bg-sk-coral px-2.5 py-1.5 font-semibold text-white hover:opacity-90 disabled:opacity-60"
      >
        {save.isPending ? "Saving…" : "Override & proceed"}
      </button>
    </div>
  );
}

/** Panel bound to an existing booking. */
export function BookingVaccinationGate({
  bookingId,
  mode = "staff",
  overriddenBy,
  overrideReason,
}: {
  bookingId: string;
  mode?: "staff" | "portal";
  overriddenBy?: string | null;
  overrideReason?: string | null;
}) {
  const q = useBookingVaccinationGate(bookingId);
  return (
    <VaccinationGatePanel
      rows={q.data ?? []}
      loading={q.isLoading}
      mode={mode}
      bookingId={bookingId}
      overriddenBy={overriddenBy}
      overrideReason={overrideReason}
    />
  );
}

/** Panel for a booking that doesn't exist yet (forms and wizards). */
export function PetsVaccinationGate({
  petIds,
  serviceType,
  onDate,
  mode = "staff",
}: {
  petIds: string[];
  serviceType?: string | null;
  onDate?: string | null;
  mode?: "staff" | "portal";
}) {
  const q = usePetsVaccinationStatus(petIds, serviceType, onDate);
  return <VaccinationGatePanel rows={q.data ?? []} loading={q.isLoading} mode={mode} />;
}

/** True when any required vaccination is outstanding for these pets. */
export function usePetsVaxBlocked(petIds: string[], serviceType?: string | null, onDate?: string | null) {
  const q = usePetsVaccinationStatus(petIds, serviceType, onDate);
  return {
    loading: q.isLoading,
    blocked: (q.data ?? []).some((r) => isVaxOutstanding(r.status)),
    rows: q.data ?? [],
  };
}