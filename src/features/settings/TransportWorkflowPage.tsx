import { useEffect, useState } from "react";
import { Save, MapPin } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import AddressAutocomplete from "@/components/address/AddressAutocomplete";
import { PaymentHoldFields } from "./PaymentHoldFields";
import {
  useTransportWorkflowSettings, useUpdateTransportWorkflowSettings,
} from "@/features/transport/queries";

const PERMISSION = "settings.transport.manage";

interface SuburbFee { suburb: string; fee: number }
function fromMap(m: Record<string, number> | null | undefined): SuburbFee[] {
  if (!m) return [];
  return Object.entries(m).map(([suburb, fee]) => ({ suburb, fee: Number(fee) || 0 }));
}
function toMap(rows: SuburbFee[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const s = r.suburb.trim();
    if (!s) continue;
    out[s] = Number(r.fee) || 0;
  }
  return out;
}

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
    default_fee_zar: 0,
    round_trip_multiplier: 1.8,
    photo_gate_mode: "off" as "off" | "soft" | "hard",
    base_address: "",
    base_place_id: "" as string | null,
    base_latitude: null as number | null,
    base_longitude: null as number | null,
    enforce_radius: true,
    radius_gate_mode: "warn" as "warn" | "block",
    require_gate_code: true,
    gate_code_required_by_time: "07:00",
    require_payment_to_confirm: true,
    payment_hold_hours: 48,
    overbooking_mode: "warn" as "warn" | "block",
    max_stops_per_van_per_day: 12,
    auto_create_hotel_legs: true,
    hotel_pickup_time: "09:00",
    hotel_dropoff_time: "16:00",
  });
  const [suburbFees, setSuburbFees] = useState<SuburbFee[]>([]);

  useEffect(() => {
    if (settingsQ.data) {
      setForm({
        min_leg_gap_minutes: settingsQ.data.min_leg_gap_minutes,
        max_leg_gap_minutes: settingsQ.data.max_leg_gap_minutes,
        day_start_time: trimTime(settingsQ.data.day_start_time),
        day_end_time: trimTime(settingsQ.data.day_end_time),
        default_pickup_lead_minutes: settingsQ.data.default_pickup_lead_minutes,
        default_dropoff_trail_minutes: settingsQ.data.default_dropoff_trail_minutes,
        default_fee_zar: Number(settingsQ.data.default_fee_zar ?? 0),
        round_trip_multiplier: Number(settingsQ.data.round_trip_multiplier ?? 1.8),
        photo_gate_mode: ((settingsQ.data as any).photo_gate_mode ?? "off") as "off" | "soft" | "hard",
        base_address: (settingsQ.data as any).base_address ?? "",
        base_place_id: (settingsQ.data as any).base_place_id ?? null,
        base_latitude: (settingsQ.data as any).base_latitude ?? null,
        base_longitude: (settingsQ.data as any).base_longitude ?? null,
        enforce_radius: (settingsQ.data as any).enforce_radius ?? true,
        radius_gate_mode: ((settingsQ.data as any).radius_gate_mode ?? "warn") as "warn" | "block",
        require_gate_code: (settingsQ.data as any).require_gate_code ?? true,
        gate_code_required_by_time: trimTime((settingsQ.data as any).gate_code_required_by_time) || "07:00",
        require_payment_to_confirm: (settingsQ.data as any).require_payment_to_confirm ?? true,
        payment_hold_hours: Number((settingsQ.data as any).payment_hold_hours ?? 48),
        overbooking_mode: ((settingsQ.data as any).overbooking_mode ?? "warn") as "warn" | "block",
        max_stops_per_van_per_day: Number((settingsQ.data as any).max_stops_per_van_per_day ?? 12),
        auto_create_hotel_legs: (settingsQ.data as any).auto_create_hotel_legs ?? true,
        hotel_pickup_time: trimTime((settingsQ.data as any).hotel_pickup_time) || "09:00",
        hotel_dropoff_time: trimTime((settingsQ.data as any).hotel_dropoff_time) || "16:00",
      });
      setSuburbFees(fromMap(settingsQ.data.suburb_fees));
    }
  }, [settingsQ.data]);

  async function save() {
    try {
      await update.mutateAsync({ ...form, suburb_fees: toMap(suburbFees) } as any);
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

          <Field label="Pet photo required" hint="Drivers collect pets from home, so a photo helps — but it rarely needs to block a booking.">
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
            <Field label="Max stops per van per day" hint="Used to warn (or block) when a day's run is already full.">
              <input
                type="number" min={1} disabled={!canManage}
                value={form.max_stops_per_van_per_day}
                onChange={(e) => setForm((f) => ({ ...f, max_stops_per_van_per_day: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
            <Field label="When every van is full" hint="Applies to staff booking forms and the customer portal.">
              <select
                disabled={!canManage}
                value={form.overbooking_mode}
                onChange={(e) => setForm((f) => ({ ...f, overbooking_mode: e.target.value as "warn" | "block" }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              >
                <option value="warn">Warn — allow the booking anyway</option>
                <option value="block">Block — the day must be changed</option>
              </select>
            </Field>
          </div>

          <div className="space-y-4 rounded-lg border border-border p-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox" disabled={!canManage}
                checked={form.auto_create_hotel_legs}
                onChange={(e) => setForm((f) => ({ ...f, auto_create_hotel_legs: e.target.checked }))}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="font-medium">Auto-create legs for hotel stays</span>
                <span className="block text-xs text-muted-foreground">
                  When a hotel booking asks for collection or return home, the system creates a provisional
                  leg (no van assigned) on the arrival and collection days and bills it on the hotel invoice.
                  Cancelling the stay cancels the legs.
                </span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default collection time" hint="Used for the arrival-day pick-up leg.">
                <input
                  type="time" disabled={!canManage || !form.auto_create_hotel_legs}
                  value={form.hotel_pickup_time}
                  onChange={(e) => setForm((f) => ({ ...f, hotel_pickup_time: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                />
              </Field>
              <Field label="Default return-home time" hint="Used for the collection-day drop-off leg.">
                <input
                  type="time" disabled={!canManage || !form.auto_create_hotel_legs}
                  value={form.hotel_dropoff_time}
                  onChange={(e) => setForm((f) => ({ ...f, hotel_dropoff_time: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                />
              </Field>
            </div>
          </div>



          <PaymentHoldFields
            disabled={!canManage}
            requirePayment={form.require_payment_to_confirm}
            holdHours={form.payment_hold_hours}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          />

          <div className="border-t border-border pt-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Service area &amp; access</h3>
              <p className="text-xs text-muted-foreground">
                The depot address is the centre of the travel radius. Bookings further than the radius set in
                Policies are flagged (or blocked) when staff pick a verified address.
              </p>
            </div>
            <div>
              <AddressAutocomplete
                label="Depot / base address"
                disabled={!canManage}
                value={form.base_address}
                onChange={(v) => setForm((f) => ({ ...f, base_address: v }))}
                onSelect={(r) =>
                  setForm((f) => ({
                    ...f,
                    base_address: r.formatted_address,
                    base_place_id: r.place_id,
                    base_latitude: r.latitude,
                    base_longitude: r.longitude,
                  }))
                }
              />
              <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {form.base_latitude != null && form.base_longitude != null
                  ? `Pinned at ${form.base_latitude.toFixed(5)}, ${form.base_longitude.toFixed(5)}`
                  : "Not pinned yet — pick an address from the list so distances can be measured."}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Radius check" hint="Uses the travel radius (km) set under Policies.">
                <select
                  disabled={!canManage}
                  value={!form.enforce_radius ? "off" : form.radius_gate_mode}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({
                      ...f,
                      enforce_radius: v !== "off",
                      radius_gate_mode: v === "block" ? "block" : "warn",
                    }));
                  }}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                >
                  <option value="off">Off — never check distance</option>
                  <option value="warn">Warn — flag out-of-area collections</option>
                  <option value="block">Block — staff must override to book out of area</option>
                </select>
              </Field>
              <Field label="Gate code needed by" hint="Prompt staff and customers to supply the gate code before this time on the collection day.">
                <input
                  type="time" disabled={!canManage}
                  value={form.gate_code_required_by_time}
                  onChange={(e) => setForm((f) => ({ ...f, gate_code_required_by_time: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox" disabled={!canManage} checked={form.require_gate_code}
                onChange={(e) => setForm((f) => ({ ...f, require_gate_code: e.target.checked }))}
              />
              Prompt for a gate code / access note on every transport booking
            </label>
          </div>

          <div className="border-t border-border pt-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Pricing</h3>
              <p className="text-xs text-muted-foreground">
                Used by the transport auto-invoice line. A matching suburb below overrides the default fee.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default fee (ZAR)" hint="Applied when no suburb-specific fee is configured.">
                <input
                  type="number" min={0} step="0.01" disabled={!canManage}
                  value={form.default_fee_zar}
                  onChange={(e) => setForm((f) => ({ ...f, default_fee_zar: Number(e.target.value) }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                />
              </Field>
              <Field label="Round-trip multiplier" hint="Applied when direction = round_trip. Default 1.8×.">
                <input
                  type="number" min={1} step="0.05" disabled={!canManage}
                  value={form.round_trip_multiplier}
                  onChange={(e) => setForm((f) => ({ ...f, round_trip_multiplier: Number(e.target.value) }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                />
              </Field>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suburb fees (ZAR)</div>
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() => setSuburbFees((r) => [...r, { suburb: "", fee: 0 }])}
                  className="text-xs font-semibold text-sk-coral hover:underline disabled:opacity-50"
                >
                  + Add suburb
                </button>
              </div>
              {suburbFees.length === 0 && (
                <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                  No suburb overrides. All legs will use the default fee.
                </div>
              )}
              <ul className="space-y-2">
                {suburbFees.map((row, i) => (
                  <li key={i} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
                    <input
                      type="text" disabled={!canManage} placeholder="Suburb (case-sensitive)"
                      value={row.suburb}
                      onChange={(e) => setSuburbFees((rows) => rows.map((r, idx) => idx === i ? { ...r, suburb: e.target.value } : r))}
                      className="h-9 rounded-lg border border-border bg-white px-3 text-sm"
                    />
                    <input
                      type="number" min={0} step="0.01" disabled={!canManage}
                      value={row.fee}
                      onChange={(e) => setSuburbFees((rows) => rows.map((r, idx) => idx === i ? { ...r, fee: Number(e.target.value) } : r))}
                      className="h-9 rounded-lg border border-border bg-white px-3 text-sm"
                    />
                    <button
                      type="button" disabled={!canManage}
                      onClick={() => setSuburbFees((rows) => rows.filter((_, idx) => idx !== i))}
                      className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
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