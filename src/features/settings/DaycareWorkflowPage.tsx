import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import {
  useDaycareWorkflowSettings, useUpdateDaycareWorkflowSettings,
} from "@/features/daycare/queries";

const PERMISSION = "settings.daycare.manage";

function trimTime(t: string | undefined | null): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default function DaycareWorkflowPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);

  const settingsQ = useDaycareWorkflowSettings(tenantId);
  const update = useUpdateDaycareWorkflowSettings(tenantId ?? "");

  const [form, setForm] = useState({
    arrival_window_start: "07:00",
    arrival_window_end: "09:30",
    late_arrival_cutoff: "10:00",
    auto_checkout_time: "18:00",
    block_unvaccinated: false,
    require_assessment: false,
    photo_gate_mode: "hard" as "off" | "soft" | "hard",
    daily_capacity: "" as string,
    stay_play_default_collect_time: "16:30",
    stay_play_grace_minutes: 15,
  });

  useEffect(() => {
    if (settingsQ.data) {
      setForm({
        arrival_window_start: trimTime(settingsQ.data.arrival_window_start),
        arrival_window_end: trimTime(settingsQ.data.arrival_window_end),
        late_arrival_cutoff: trimTime(settingsQ.data.late_arrival_cutoff),
        auto_checkout_time: trimTime(settingsQ.data.auto_checkout_time),
        block_unvaccinated: settingsQ.data.block_unvaccinated,
        require_assessment: Boolean((settingsQ.data as any).require_assessment),
        photo_gate_mode: ((settingsQ.data as any).photo_gate_mode ?? "hard") as "off" | "soft" | "hard",
        daily_capacity: settingsQ.data.daily_capacity == null ? "" : String(settingsQ.data.daily_capacity),
        stay_play_default_collect_time: trimTime(settingsQ.data.stay_play_default_collect_time) || "16:30",
        stay_play_grace_minutes: Number(settingsQ.data.stay_play_grace_minutes ?? 15),
      });
    }
  }, [settingsQ.data]);

  async function save() {
    try {
      await update.mutateAsync({
        ...form,
        daily_capacity: form.daily_capacity === "" ? null : Number(form.daily_capacity),
        stay_play_grace_minutes: Number(form.stay_play_grace_minutes) || 0,
      } as any);
      toast.success("Daycare workflow settings saved");
    } catch (err: any) { toast.error(err?.message ?? "Failed to save"); }
  }

  return (
    <>
      <AppHeader title="Daycare workflow" subtitle="Arrival window, late cutoff, capacity and Stay & Play." />
      <div className="flex-1 p-6">
        <div className="sk-card max-w-2xl p-6 space-y-6">
          {!canManage && (
            <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
              Read-only access. Only staff with the "Manage daycare settings" permission can change these values.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Arrival window starts at">
              <input type="time" disabled={!canManage} value={form.arrival_window_start}
                onChange={(e) => setForm((f) => ({ ...f, arrival_window_start: e.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
            <Field label="Arrival window ends at">
              <input type="time" disabled={!canManage} value={form.arrival_window_end}
                onChange={(e) => setForm((f) => ({ ...f, arrival_window_end: e.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
            <Field label="Late arrival cutoff" hint="Arrivals after this time are flagged as late.">
              <input type="time" disabled={!canManage} value={form.late_arrival_cutoff}
                onChange={(e) => setForm((f) => ({ ...f, late_arrival_cutoff: e.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
            <Field label="Auto-checkout time" hint="Pets still checked in at this time are auto-checked-out overnight (not yet enforced).">
              <input type="time" disabled={!canManage} value={form.auto_checkout_time}
                onChange={(e) => setForm((f) => ({ ...f, auto_checkout_time: e.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
          </div>

          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" disabled={!canManage} checked={form.block_unvaccinated}
              onChange={(e) => setForm((f) => ({ ...f, block_unvaccinated: e.target.checked }))} />
            Block check-in for pets with missing or expired vaccinations
          </label>

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" disabled={!canManage} checked={form.require_assessment}
              onChange={(e) => setForm((f) => ({ ...f, require_assessment: e.target.checked }))} />
            <span>
              Require a completed assessment day before a daycare enrolment goes active
              <span className="block text-[11px] text-muted-foreground">
                Staff can still waive it on an individual enrolment.
              </span>
            </span>
          </label>

          <Field label="Pet photo required" hint="A photo on file lets staff match the right dog to the right owner at drop-off.">
            <select
              disabled={!canManage}
              value={form.photo_gate_mode}
              onChange={(e) => setForm((f) => ({ ...f, photo_gate_mode: e.target.value as "off" | "soft" | "hard" }))}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
            >
              <option value="hard">Required — block the booking until a photo is on file</option>
              <option value="soft">Warn — flag the missing photo but allow the booking</option>
              <option value="off">Off — skip check</option>
            </select>
          </Field>

          <div className="border-t border-border pt-5">
            <div className="mb-3 text-sm font-semibold">Capacity &amp; Stay &amp; Play</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Daily capacity" hint="Total daycare spaces per day. Stay & Play pets count towards this.">
                <input type="number" min={0} disabled={!canManage} value={form.daily_capacity}
                  onChange={(e) => setForm((f) => ({ ...f, daily_capacity: e.target.value }))}
                  placeholder="e.g. 40"
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
              <Field label="Default collection time" hint="Used for new Stay & Play sessions.">
                <input type="time" disabled={!canManage} value={form.stay_play_default_collect_time}
                  onChange={(e) => setForm((f) => ({ ...f, stay_play_default_collect_time: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
              <Field label="Overdue grace (minutes)" hint="How long after the collection time before a pet is flagged overdue.">
                <input type="number" min={0} disabled={!canManage} value={form.stay_play_grace_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, stay_play_grace_minutes: Number(e.target.value) }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
            </div>
          </div>

          <div className="flex justify-end">
            <button disabled={!canManage || update.isPending} onClick={save}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral/90 disabled:opacity-50">
              <Save className="h-4 w-4" /> Save changes
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