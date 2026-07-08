import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import {
  useTransportWorkflowSettings, useUpdateTransportWorkflowSettings,
} from "@/features/transport/queries";

const PERMISSION = "settings.transport.manage";

function trimTime(t: string | undefined | null): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default function TransportWorkflowPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);

  const settingsQ = useTransportWorkflowSettings(tenantId);
  const update = useUpdateTransportWorkflowSettings(tenantId ?? "");

  const [form, setForm] = useState({
    min_leg_gap_minutes: 15,
    max_leg_gap_minutes: 120,
    day_start_time: "07:00",
    day_end_time: "18:00",
    default_pickup_lead_minutes: 30,
    default_dropoff_trail_minutes: 15,
  });

  useEffect(() => {
    if (settingsQ.data) {
      setForm({
        min_leg_gap_minutes: settingsQ.data.min_leg_gap_minutes,
        max_leg_gap_minutes: settingsQ.data.max_leg_gap_minutes,
        day_start_time: trimTime(settingsQ.data.day_start_time),
        day_end_time: trimTime(settingsQ.data.day_end_time),
        default_pickup_lead_minutes: settingsQ.data.default_pickup_lead_minutes,
        default_dropoff_trail_minutes: settingsQ.data.default_dropoff_trail_minutes,
      });
    }
  }, [settingsQ.data]);

  async function save() {
    try {
      await update.mutateAsync(form);
      toast.success("Transport workflow settings saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    }
  }

  return (
    <>
      <AppHeader
        title="Transport workflow"
        subtitle="Pick-up / drop-off gap warnings, working hours and default lead time."
      />
      <div className="flex-1 p-6">
        <div className="sk-card max-w-2xl p-6 space-y-6">
          {!canManage && (
            <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
              Read-only access. Only staff with the "Manage transport settings" permission can change these values.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Min leg gap (minutes)" hint="Warn if two consecutive legs are closer than this.">
              <input
                type="number" min={0} disabled={!canManage}
                value={form.min_leg_gap_minutes}
                onChange={(e) => setForm((f) => ({ ...f, min_leg_gap_minutes: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
            <Field label="Max leg gap (minutes)" hint="Warn if the driver has more than this idle between legs.">
              <input
                type="number" min={0} disabled={!canManage}
                value={form.max_leg_gap_minutes}
                onChange={(e) => setForm((f) => ({ ...f, max_leg_gap_minutes: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
            <Field label="Day starts at">
              <input
                type="time" disabled={!canManage}
                value={form.day_start_time}
                onChange={(e) => setForm((f) => ({ ...f, day_start_time: e.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
            <Field label="Day ends at">
              <input
                type="time" disabled={!canManage}
                value={form.day_end_time}
                onChange={(e) => setForm((f) => ({ ...f, day_end_time: e.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
            <Field label="Pickup lead time (minutes)" hint="Default minutes before the service starts, used to prefill new pick-up legs.">
              <input
                type="number" min={0} disabled={!canManage}
                value={form.default_pickup_lead_minutes}
                onChange={(e) => setForm((f) => ({ ...f, default_pickup_lead_minutes: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
            <Field label="Drop-off trail time (minutes)" hint="Default minutes after the service ends, used to prefill new drop-off legs.">
              <input
                type="number" min={0} disabled={!canManage}
                value={form.default_dropoff_trail_minutes}
                onChange={(e) => setForm((f) => ({ ...f, default_dropoff_trail_minutes: Number(e.target.value) }))}
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