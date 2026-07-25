import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import {
  useGroomingWorkflowSettings,
  useUpdateGroomingWorkflowSettings,
  type GroomingVaxGateMode,
} from "@/features/grooming/workflowQueries";

const PERMISSION = "settings.grooming.manage";

export default function GroomingWorkflowPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);

  const settingsQ = useGroomingWorkflowSettings(tenantId);
  const update = useUpdateGroomingWorkflowSettings(tenantId ?? "");

  const [form, setForm] = useState({
    vax_gate_mode: "soft" as GroomingVaxGateMode,
    pensioner_discount_pct: 10,
    default_mobile_travel_fee_zar: 110,
    matted_rate_per_15min_zar: 50,
    overtime_threshold_minutes: 60,
    after_grooming_stay_play_zar: 250,
    pickup_dropoff_fee_zar: 140,
    puppy_half_price_max_months: 6,
    pensioner_discount_days: [1, 3] as number[],
    cancellation_fee_pct: 100,
    cancellation_notice_hours: 24,
    sedation_enabled: true,
    sedation_default_fee_zar: 0,
  });

  useEffect(() => {
    if (settingsQ.data) {
      const d = settingsQ.data;
      setForm({
        vax_gate_mode: d.vax_gate_mode,
        pensioner_discount_pct: Number(d.pensioner_discount_pct ?? 0),
        default_mobile_travel_fee_zar: Number(d.default_mobile_travel_fee_zar ?? 0),
        matted_rate_per_15min_zar: Number(d.matted_rate_per_15min_zar ?? 50),
        overtime_threshold_minutes: Number(d.overtime_threshold_minutes ?? 60),
        after_grooming_stay_play_zar: Number(d.after_grooming_stay_play_zar ?? 250),
        pickup_dropoff_fee_zar: Number(d.pickup_dropoff_fee_zar ?? 140),
        puppy_half_price_max_months: Number(d.puppy_half_price_max_months ?? 6),
        pensioner_discount_days: (d.pensioner_discount_days ?? [1, 3]) as number[],
        cancellation_fee_pct: Number(d.cancellation_fee_pct ?? 100),
        cancellation_notice_hours: Number(d.cancellation_notice_hours ?? 24),
        sedation_enabled: Boolean(d.sedation_enabled ?? true),
        sedation_default_fee_zar: Number(d.sedation_default_fee_zar ?? 0),
      });
    }
  }, [settingsQ.data]);

  async function save() {
    try {
      await update.mutateAsync(form);
      toast.success("Grooming workflow settings saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    }
  }

  return (
    <>
      <AppHeader title="Grooming workflow" subtitle="Vaccination gate, pensioner discount, mobile travel fee." />
      <div className="flex-1 p-6">
        <div className="sk-card max-w-2xl p-6 space-y-6">
          {!canManage && (
            <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
              You have read-only access. Only staff with the "Manage grooming rate card" permission can change these values.
            </div>
          )}

          <Field label="Vaccination gate" hint="Behaviour when a pet's vaccinations are missing/expired at check-in.">
            <select
              disabled={!canManage}
              value={form.vax_gate_mode}
              onChange={(e) => setForm((f) => ({ ...f, vax_gate_mode: e.target.value as GroomingVaxGateMode }))}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
            >
              <option value="soft">Soft — warn and allow with logged override</option>
              <option value="hard">Hard — block check-in</option>
              <option value="off">Off — skip check</option>
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pensioner discount %" hint="Applied to the grooming package line on the invoice.">
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                disabled={!canManage}
                value={form.pensioner_discount_pct}
                onChange={(e) => setForm((f) => ({ ...f, pensioner_discount_pct: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
            <Field label="Default mobile travel fee (ZAR)">
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={!canManage}
                value={form.default_mobile_travel_fee_zar}
                onChange={(e) => setForm((f) => ({ ...f, default_mobile_travel_fee_zar: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <button
              disabled={!canManage || update.isPending}
              onClick={save}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral/90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </label>
  );
}