import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import {
  useHotelWorkflowSettings, useUpdateHotelWorkflowSettings,
  type VaxGateMode, type OverbookingMode,
} from "@/features/hotelCattery/queries";

const PERMISSION = "settings.hotel.manage";

function trimTime(t: string | undefined | null): string {
  if (!t) return "";
  // Postgres time columns come back as "HH:MM:SS"; <input type="time"> wants "HH:MM"
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default function HotelWorkflowPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);

  const settingsQ = useHotelWorkflowSettings(tenantId);
  const update = useUpdateHotelWorkflowSettings(tenantId ?? "");

  const [form, setForm] = useState({
    vax_gate_mode: "soft" as VaxGateMode,
    photo_gate_mode: "hard" as "off" | "soft" | "hard",
    overbooking_mode: "warn" as OverbookingMode,
    check_in_open_time: "08:00",
    check_in_close_time: "18:00",
    check_out_by_time: "11:00",
    late_checkout_fee_zar: 0,
    quote_validity_days: 14,
    portal_activate_on_quote_accept: true,
    peak_start_month_day: "",
    peak_end_month_day: "",
    deposit_split_enabled: true,
    checkout_groom_discount_pct: 50,
    daycare_credit_enabled: true,
    guidelines_md: "",
    extra_food_fee_zar: 0,
    no_refund_early_checkout: true,
    require_labelling_checklist: true,
    photo_policy_note: "",
  });

  useEffect(() => {
    if (settingsQ.data) {
      setForm({
        vax_gate_mode: settingsQ.data.vax_gate_mode,
        photo_gate_mode: ((settingsQ.data as any).photo_gate_mode ?? "hard") as "off" | "soft" | "hard",
        overbooking_mode: settingsQ.data.overbooking_mode ?? "warn",
        check_in_open_time: trimTime(settingsQ.data.check_in_open_time),
        check_in_close_time: trimTime(settingsQ.data.check_in_close_time),
        check_out_by_time: trimTime(settingsQ.data.check_out_by_time),
        late_checkout_fee_zar: Number(settingsQ.data.late_checkout_fee_zar ?? 0),
        quote_validity_days: Number((settingsQ.data as any).quote_validity_days ?? 14),
        portal_activate_on_quote_accept: (settingsQ.data as any).portal_activate_on_quote_accept ?? true,
        peak_start_month_day: settingsQ.data.peak_start_month_day ?? "",
        peak_end_month_day: settingsQ.data.peak_end_month_day ?? "",
        deposit_split_enabled: settingsQ.data.deposit_split_enabled ?? true,
        checkout_groom_discount_pct: Number(settingsQ.data.checkout_groom_discount_pct ?? 50),
        daycare_credit_enabled: settingsQ.data.daycare_credit_enabled ?? true,
        guidelines_md: (settingsQ.data as any).guidelines_md ?? "",
        extra_food_fee_zar: Number((settingsQ.data as any).extra_food_fee_zar ?? 0),
        no_refund_early_checkout: (settingsQ.data as any).no_refund_early_checkout ?? true,
        require_labelling_checklist: (settingsQ.data as any).require_labelling_checklist ?? true,
        photo_policy_note: (settingsQ.data as any).photo_policy_note ?? "",
      });
    }
  }, [settingsQ.data]);

  async function save() {
    try {
      await update.mutateAsync({
        vax_gate_mode: form.vax_gate_mode,
        photo_gate_mode: form.photo_gate_mode,
        overbooking_mode: form.overbooking_mode,
        check_in_open_time: form.check_in_open_time,
        check_in_close_time: form.check_in_close_time,
        check_out_by_time: form.check_out_by_time,
        late_checkout_fee_zar: form.late_checkout_fee_zar,
        quote_validity_days: form.quote_validity_days,
        portal_activate_on_quote_accept: form.portal_activate_on_quote_accept,
        peak_start_month_day: form.peak_start_month_day || null,
        peak_end_month_day: form.peak_end_month_day || null,
        deposit_split_enabled: form.deposit_split_enabled,
        checkout_groom_discount_pct: form.checkout_groom_discount_pct,
        daycare_credit_enabled: form.daycare_credit_enabled,
        extra_food_fee_zar: form.extra_food_fee_zar,
        no_refund_early_checkout: form.no_refund_early_checkout,
        require_labelling_checklist: form.require_labelling_checklist,
        photo_policy_note: form.photo_policy_note.trim() || null,
        guidelines_md: form.guidelines_md.trim() || null,
        ...(form.guidelines_md.trim() !== (((settingsQ.data as any)?.guidelines_md ?? "").trim())
          ? { guidelines_version: Number((settingsQ.data as any)?.guidelines_version ?? 0) + 1 }
          : {}),
      } as any);
      toast.success("Hotel workflow settings saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    }
  }

  return (
    <>
      <AppHeader
        title="Hotel & Cattery workflow"
        subtitle="Vaccination gate, capacity rules, check-in window and late-checkout fee."
      />
      <div className="flex-1 p-6">
        <div className="sk-card max-w-2xl p-6 space-y-6">
          {!canManage && (
            <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
              You have read-only access. Only staff with the "Manage hotel & cattery settings" permission can change these values.
            </div>
          )}

          <Field label="Vaccination gate" hint="What happens on check-in when a pet's vaccinations are missing or expired.">
            <select
              disabled={!canManage}
              value={form.vax_gate_mode}
              onChange={(e) => setForm((f) => ({ ...f, vax_gate_mode: e.target.value as VaxGateMode }))}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
            >
              <option value="soft">Soft — warn and allow with logged override</option>
              <option value="hard">Hard — block check-in</option>
              <option value="off">Off — skip check</option>
            </select>
          </Field>

          <Field
            label="When a pen/space is full"
            hint="Capacity is the pens/spaces set on each hotel or cattery resource under Settings → Resources."
          >
            <select
              disabled={!canManage}
              value={form.overbooking_mode}
              onChange={(e) => setForm((f) => ({ ...f, overbooking_mode: e.target.value as OverbookingMode }))}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
            >
              <option value="warn">Warn — staff can overbook after confirming</option>
              <option value="block">Block — refuse bookings past capacity</option>
            </select>
          </Field>

          <Field label="Pet photo required" hint="A photo on file lets staff match the right dog to the right owner at check-in.">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Check-in opens at">
              <input
                type="time"
                disabled={!canManage}
                value={form.check_in_open_time}
                onChange={(e) => setForm((f) => ({ ...f, check_in_open_time: e.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
            <Field label="Check-in closes at">
              <input
                type="time"
                disabled={!canManage}
                value={form.check_in_close_time}
                onChange={(e) => setForm((f) => ({ ...f, check_in_close_time: e.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
            <Field label="Check-out by">
              <input
                type="time"
                disabled={!canManage}
                value={form.check_out_by_time}
                onChange={(e) => setForm((f) => ({ ...f, check_out_by_time: e.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
            <Field label="Late check-out fee (ZAR)">
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={!canManage}
                value={form.late_checkout_fee_zar}
                onChange={(e) => setForm((f) => ({ ...f, late_checkout_fee_zar: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
            <Field
              label="Quote validity (days)"
              hint="How long a hotel quote holds the dates. The countdown starts the moment the quote is emailed; when it lapses the quote expires and the dates are released."
            >
              <input
                type="number"
                min={1}
                max={90}
                step={1}
                disabled={!canManage}
                value={form.quote_validity_days}
                onChange={(e) => setForm((f) => ({ ...f, quote_validity_days: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Peak season starts (MM-DD)" hint="e.g. 12-15 for 15 December. Leave blank to disable peak pricing.">
              <input
                type="text"
                placeholder="MM-DD"
                pattern="\d{2}-\d{2}"
                disabled={!canManage}
                value={form.peak_start_month_day}
                onChange={(e) => setForm((f) => ({ ...f, peak_start_month_day: e.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
            <Field label="Peak season ends (MM-DD)">
              <input
                type="text"
                placeholder="MM-DD"
                pattern="\d{2}-\d{2}"
                disabled={!canManage}
                value={form.peak_end_month_day}
                onChange={(e) => setForm((f) => ({ ...f, peak_end_month_day: e.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
          </div>

          <div className="flex justify-end">
            </div>
            {null}
          </div>

          <div className="space-y-4 rounded-xl border border-border p-4">
            <div className="text-sm font-semibold">Money rules</div>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={form.deposit_split_enabled}
                onChange={(e) => setForm((f) => ({ ...f, deposit_split_enabled: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span className="text-sm">
                Split hotel invoices into deposit + balance
                <span className="block text-[11px] text-muted-foreground">
                  Uses the deposit % and balance-due days from Settings → Policies. The deposit invoice secures the
                  booking; the balance invoice is due before arrival.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={form.portal_activate_on_quote_accept}
                onChange={(e) => setForm((f) => ({ ...f, portal_activate_on_quote_accept: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span className="text-sm">
                Activate portal access when a quote is accepted
                <span className="block text-[11px] text-muted-foreground">
                  When a customer accepts a quote from the emailed link, they are sent an invitation to set a password
                  so they can see the booking, the invoice and pay online. Switch off to simply email the invoice.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={form.daycare_credit_enabled}
                onChange={(e) => setForm((f) => ({ ...f, daycare_credit_enabled: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span className="text-sm">
                Credit daycare customers for nights they stay in the hotel
                <span className="block text-[11px] text-muted-foreground">
                  Credits appear as a negative line on the next monthly daycare invoice.
                </span>
              </span>
            </label>

            <Field
              label="Checkout-day grooming discount (%)"
              hint="Applied automatically to a groom booked on the day a hotel guest checks out. Set 0 to disable."
            >
              <input
                type="number"
                min={0}
                max={100}
                step="1"
                disabled={!canManage}
                value={form.checkout_groom_discount_pct}
                onChange={(e) => setForm((f) => ({ ...f, checkout_groom_discount_pct: Number(e.target.value) }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </Field>
          </div>

          <div className="sk-card space-y-4 p-4">
            <div className="text-sm font-semibold">Stay rules</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Extra food fee (ZAR)" hint="Charged per stay when the hotel supplies food from the Deli.">
                <input
                  type="number" min={0} step="0.01" disabled={!canManage}
                  value={form.extra_food_fee_zar}
                  onChange={(e) => setForm((f) => ({ ...f, extra_food_fee_zar: Number(e.target.value) }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                />
              </Field>
              <Field label="Photo policy note" hint="Shown with the photo consent option on the accommodation form.">
                <input
                  type="text" disabled={!canManage}
                  value={form.photo_policy_note}
                  onChange={(e) => setForm((f) => ({ ...f, photo_policy_note: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                />
              </Field>
            </div>
            <label className="flex items-start gap-2">
              <input
                type="checkbox" disabled={!canManage}
                checked={form.no_refund_early_checkout}
                onChange={(e) => setForm((f) => ({ ...f, no_refund_early_checkout: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span className="text-sm">
                No refund for early check-out
                <span className="block text-[11px] text-muted-foreground">
                  Ending a stay early keeps the full booked amount on the invoice.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox" disabled={!canManage}
                checked={form.require_labelling_checklist}
                onChange={(e) => setForm((f) => ({ ...f, require_labelling_checklist: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span className="text-sm">
                Require the food &amp; medication labelling checklist at check-in
                <span className="block text-[11px] text-muted-foreground">
                  Staff must tick that all containers are named and dated before the stay starts.
                </span>
              </span>
            </label>
          </div>

          <div className="sk-card space-y-3 p-4">
            <div className="text-sm font-semibold">Hotel guidelines</div>
            <p className="text-xs text-muted-foreground">
              Shown to customers on the accommodation form before they confirm a stay. Markdown-lite: use # for headings and - for bullets.
              Saving a change bumps the version customers acknowledge.
            </p>
            <textarea
              disabled={!canManage}
              rows={14}
              value={form.guidelines_md}
              onChange={(e) => setForm((f) => ({ ...f, guidelines_md: e.target.value }))}
              className="w-full rounded-lg border border-border bg-white p-3 font-mono text-xs"
            />
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