import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import {
  useMobileVans, useUpdateVanHomeSuburb, useUpdateVanWorkflowSettings, useVanWorkflowSettings,
} from "@/features/mobileVans/queries";

const PERMISSION = "settings.vans.manage";

function trimTime(t: string | undefined | null): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default function VanWorkflowPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);

  const settingsQ = useVanWorkflowSettings(tenantId);
  const vansQ = useMobileVans(tenantId);
  const update = useUpdateVanWorkflowSettings(tenantId ?? "");
  const updateSuburb = useUpdateVanHomeSuburb(tenantId ?? "");

  const [form, setForm] = useState({
    min_travel_gap_minutes: 15,
    max_travel_gap_minutes: 90,
    day_start_time: "08:00",
    day_end_time: "17:00",
  });

  useEffect(() => {
    if (settingsQ.data) {
      setForm({
        min_travel_gap_minutes: settingsQ.data.min_travel_gap_minutes,
        max_travel_gap_minutes: settingsQ.data.max_travel_gap_minutes,
        day_start_time: trimTime(settingsQ.data.day_start_time),
        day_end_time: trimTime(settingsQ.data.day_end_time),
      });
    }
  }, [settingsQ.data]);

  async function save() {
    try {
      await update.mutateAsync(form);
      toast.success("Van workflow settings saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    }
  }

  async function saveSuburb(resourceId: string, homeSuburb: string) {
    try {
      await updateSuburb.mutateAsync({ resourceId, homeSuburb: homeSuburb.trim() || null });
      toast.success("Van home suburb saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    }
  }

  return (
    <>
      <AppHeader
        title="Mobile van workflow"
        subtitle="Travel gap warnings, working hours and per-van home suburb."
      />
      <div className="flex-1 space-y-6 p-6">
        <div className="sk-card max-w-2xl p-6 space-y-6">
          {!canManage && (
            <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
              Read-only access. Only staff with the "Manage mobile van settings" permission can change these values.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Min travel gap (minutes)" hint="Warn if two stops are closer than this.">
              <input
                type="number" min={0} disabled={!canManage}
                value={form.min_travel_gap_minutes}
                onChange={(e) => setForm((f) => ({ ...f, min_travel_gap_minutes: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
            <Field label="Max travel gap (minutes)" hint="Warn if the driver has more than this idle between stops.">
              <input
                type="number" min={0} disabled={!canManage}
                value={form.max_travel_gap_minutes}
                onChange={(e) => setForm((f) => ({ ...f, max_travel_gap_minutes: Number(e.target.value) }))}
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

        <div className="sk-card max-w-2xl">
          <div className="border-b border-border px-6 py-4 text-sm font-semibold">Per-van home suburb</div>
          {(vansQ.data ?? []).length === 0 ? (
            <div className="px-6 py-6 text-sm text-muted-foreground">No mobile vans configured yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {(vansQ.data ?? []).map((v) => (
                <SuburbRow key={v.id} vanId={v.id} vanName={v.name} initial={v.home_suburb ?? ""} canManage={canManage} onSave={saveSuburb} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function SuburbRow({
  vanId, vanName, initial, canManage, onSave,
}: {
  vanId: string; vanName: string; initial: string; canManage: boolean;
  onSave: (id: string, suburb: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  const dirty = value !== initial;
  return (
    <li className="flex items-center gap-3 px-6 py-3">
      <div className="w-40 shrink-0 truncate text-sm font-medium">{vanName}</div>
      <input
        type="text" disabled={!canManage}
        placeholder="e.g. Bryanston"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-9 flex-1 rounded-lg border border-border bg-white px-3 text-sm"
      />
      <button
        disabled={!canManage || !dirty}
        onClick={() => onSave(vanId, value)}
        className="h-9 rounded-md bg-sk-coral px-3 text-xs font-semibold text-white hover:bg-sk-coral/90 disabled:opacity-40"
      >
        Save
      </button>
    </li>
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