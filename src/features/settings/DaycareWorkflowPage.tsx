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
  });

  useEffect(() => {
    if (settingsQ.data) {
      setForm({
        arrival_window_start: trimTime(settingsQ.data.arrival_window_start),
        arrival_window_end: trimTime(settingsQ.data.arrival_window_end),
        late_arrival_cutoff: trimTime(settingsQ.data.late_arrival_cutoff),
        auto_checkout_time: trimTime(settingsQ.data.auto_checkout_time),
        block_unvaccinated: settingsQ.data.block_unvaccinated,
      });
    }
  }, [settingsQ.data]);

  async function save() {
    try {
      await update.mutateAsync(form);
      toast.success("Daycare workflow settings saved");
    } catch (err: any) { toast.error(err?.message ?? "Failed to save"); }
  }

  return (
    <>
      <AppHeader title="Daycare workflow" subtitle="Arrival window, late cutoff, auto-checkout." />
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