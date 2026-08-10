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
    photo_gate_mode: "off" as "off" | "soft" | "hard",
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
    sedation_fasting_hours: 8,
    sedation_instructions_md: "",
    sedation_vet_location: "",
    senior_pet_age_years: 8,
    senior_vet_check_mode: "warn" as "off" | "warn" | "block",
    rebook_nudge_enabled: true,
    rebook_weeks_min: 4,
    rebook_weeks_max: 6,
  });

  useEffect(() => {
    if (settingsQ.data) {
      const d = settingsQ.data;
      setForm({
        vax_gate_mode: d.vax_gate_mode,
        photo_gate_mode: ((d as any).photo_gate_mode ?? "off") as "off" | "soft" | "hard",
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
        sedation_fasting_hours: Number((d as any).sedation_fasting_hours ?? 8),
        sedation_instructions_md: (d as any).sedation_instructions_md ?? "",
        sedation_vet_location: (d as any).sedation_vet_location ?? "",
        senior_pet_age_years: Number((d as any).senior_pet_age_years ?? 8),
        senior_vet_check_mode: ((d as any).senior_vet_check_mode ?? "warn") as "off" | "warn" | "block",
        rebook_nudge_enabled: Boolean((d as any).rebook_nudge_enabled ?? true),
        rebook_weeks_min: Number((d as any).rebook_weeks_min ?? 4),
        rebook_weeks_max: Number((d as any).rebook_weeks_max ?? 6),
      });
    }
  }, [settingsQ.data]);

  async function save() {
    try {
      await update.mutateAsync({
        ...form,
        sedation_instructions_md: form.sedation_instructions_md.trim() || null,
        sedation_vet_location: form.sedation_vet_location.trim() || null,
      } as any);
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

          <Field label="Pet photo required" hint="Grooming clients usually bring the pet themselves, so this is normally off.">
            <select
              disabled={!canManage}
              value={form.photo_gate_mode}
              onChange={(e) => setForm((f) => ({ ...f, photo_gate_mode: e.target.value as "off" | "soft" | "hard" }))}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
            >
              <option value="off">Off — skip check</option>
              <option value="soft">Warn — flag the missing photo but allow the booking</option>
              <option value="hard">Required — block the booking until a photo is on file</option>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pickup / drop-off fee (ZAR, per way)">
              <input type="number" min={0} step="0.01" disabled={!canManage}
                value={form.pickup_dropoff_fee_zar}
                onChange={(e) => setForm((f) => ({ ...f, pickup_dropoff_fee_zar: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
            <Field label="After-groom Stay & Play (ZAR)">
              <input type="number" min={0} step="0.01" disabled={!canManage}
                value={form.after_grooming_stay_play_zar}
                onChange={(e) => setForm((f) => ({ ...f, after_grooming_stay_play_zar: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Matted / overtime rate per 15 min (ZAR)" hint="Applied to every 15 min block beyond the overtime threshold.">
              <input type="number" min={0} step="0.01" disabled={!canManage}
                value={form.matted_rate_per_15min_zar}
                onChange={(e) => setForm((f) => ({ ...f, matted_rate_per_15min_zar: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
            <Field label="Overtime threshold (minutes)">
              <input type="number" min={0} step="5" disabled={!canManage}
                value={form.overtime_threshold_minutes}
                onChange={(e) => setForm((f) => ({ ...f, overtime_threshold_minutes: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Puppy half-price cutoff (months)" hint="Pets under this age pay 50% of the package.">
              <input type="number" min={0} max={24} disabled={!canManage}
                value={form.puppy_half_price_max_months}
                onChange={(e) => setForm((f) => ({ ...f, puppy_half_price_max_months: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
            <Field label="Pensioner discount days" hint="Weekday numbers 0=Sun … 6=Sat, comma-separated. Empty = every day.">
              <input type="text" disabled={!canManage}
                value={form.pensioner_discount_days.join(",")}
                onChange={(e) => setForm((f) => ({ ...f, pensioner_discount_days: e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n)) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cancellation fee %" hint="Charged if cancellation is inside the notice window.">
              <input type="number" min={0} max={100} step="1" disabled={!canManage}
                value={form.cancellation_fee_pct}
                onChange={(e) => setForm((f) => ({ ...f, cancellation_fee_pct: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
            <Field label="Cancellation notice (hours)">
              <input type="number" min={0} step="1" disabled={!canManage}
                value={form.cancellation_notice_hours}
                onChange={(e) => setForm((f) => ({ ...f, cancellation_notice_hours: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sedation enabled" hint="If off, the sedation consent workflow is hidden.">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm">
                <input type="checkbox" disabled={!canManage}
                  checked={form.sedation_enabled}
                  onChange={(e) => setForm((f) => ({ ...f, sedation_enabled: e.target.checked }))} />
                Offer sedation with logged consent
              </label>
            </Field>
            <Field label="Default sedation fee (ZAR)" hint="Paid directly to Sloppy Kisses. Can be overridden per booking.">
              <input type="number" min={0} step="0.01" disabled={!canManage}
                value={form.sedation_default_fee_zar}
                onChange={(e) => setForm((f) => ({ ...f, sedation_default_fee_zar: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
          </div>

          {form.sedation_enabled && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="text-sm font-semibold">Sedation preparation</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fasting hours before appointment" hint="Shown to the owner when a sedated groom is booked.">
                  <input type="number" min={0} max={24} disabled={!canManage}
                    value={form.sedation_fasting_hours}
                    onChange={(e) => setForm((f) => ({ ...f, sedation_fasting_hours: Number(e.target.value) }))}
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                </Field>
                <Field label="Vet / sedation location" hint="Where the sedation is administered, e.g. the partner vet practice.">
                  <input type="text" disabled={!canManage}
                    value={form.sedation_vet_location}
                    onChange={(e) => setForm((f) => ({ ...f, sedation_vet_location: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                </Field>
              </div>
              <Field label="Owner instructions" hint="Included on the booking confirmation for sedated grooms.">
                <textarea disabled={!canManage} rows={4}
                  value={form.sedation_instructions_md}
                  onChange={(e) => setForm((f) => ({ ...f, sedation_instructions_md: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white p-3 text-sm" />
              </Field>
            </div>
          )}

          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="text-sm font-semibold">Senior pets &amp; rebooking</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Senior pet age (years)" hint="Pets at or above this age are flagged as senior at booking.">
                <input type="number" min={0} max={25} disabled={!canManage}
                  value={form.senior_pet_age_years}
                  onChange={(e) => setForm((f) => ({ ...f, senior_pet_age_years: Number(e.target.value) }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
              <Field label="Senior vet-check requirement">
                <select disabled={!canManage}
                  value={form.senior_vet_check_mode}
                  onChange={(e) => setForm((f) => ({ ...f, senior_vet_check_mode: e.target.value as "off" | "warn" | "block" }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
                  <option value="off">Off — no senior check</option>
                  <option value="warn">Warn — flag that a vet clearance is advised</option>
                  <option value="block">Block — require a logged vet clearance first</option>
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!canManage}
                checked={form.rebook_nudge_enabled}
                onChange={(e) => setForm((f) => ({ ...f, rebook_nudge_enabled: e.target.checked }))} />
              Nudge owners to rebook after each groom
            </label>
            {form.rebook_nudge_enabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Rebook window from (weeks)">
                  <input type="number" min={1} max={52} disabled={!canManage}
                    value={form.rebook_weeks_min}
                    onChange={(e) => setForm((f) => ({ ...f, rebook_weeks_min: Number(e.target.value) }))}
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                </Field>
                <Field label="Rebook window to (weeks)">
                  <input type="number" min={1} max={52} disabled={!canManage}
                    value={form.rebook_weeks_max}
                    onChange={(e) => setForm((f) => ({ ...f, rebook_weeks_max: Number(e.target.value) }))}
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                </Field>
              </div>
            )}
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