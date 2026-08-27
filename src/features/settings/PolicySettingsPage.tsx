import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  tenant_id: string;
  hotel_deposit_percent: number;
  hotel_balance_due_days_before: number;
  hotel_free_amendments: number;
  hotel_amendment_fee: number;
  hotel_cancellation_cutoff_days: number;
  grooming_cancellation_hours: number;
  daycare_notice_months: number;
  daycare_catchup_window_days: number;
  overdue_interest_percent_per_month: number;
  consent_grace_days: number;
  hotel_prearrival_reminder_days: number[];
  late_pickup_cutoff_time: string;
  late_pickup_grace_minutes: number;
  late_pickup_fee_zar: number;
  late_pickup_fee_per_15min: number;
  overnight_conversion_after_time: string;
  overnight_conversion_rate_zar: number;
  abandonment_hours: number;
  failed_collection_fee_zar: number;
  transport_radius_km: number;
  parasite_treatment_fee_zar: number;
  annual_increase_percent: number;
  hide_customer_phone_from_staff: boolean;
};

const DEFAULTS: Omit<Row, "tenant_id"> = {
  hotel_deposit_percent: 50,
  hotel_balance_due_days_before: 14,
  hotel_free_amendments: 1,
  hotel_amendment_fee: 150,
  hotel_cancellation_cutoff_days: 14,
  grooming_cancellation_hours: 24,
  daycare_notice_months: 1,
  daycare_catchup_window_days: 30,
  overdue_interest_percent_per_month: 3,
  consent_grace_days: 30,
  hotel_prearrival_reminder_days: [3, 2, 1],
  late_pickup_cutoff_time: "17:30",
  late_pickup_grace_minutes: 15,
  late_pickup_fee_zar: 0,
  late_pickup_fee_per_15min: 0,
  overnight_conversion_after_time: "18:30",
  overnight_conversion_rate_zar: 0,
  abandonment_hours: 48,
  failed_collection_fee_zar: 0,
  transport_radius_km: 20,
  parasite_treatment_fee_zar: 0,
  annual_increase_percent: 10,
  hide_customer_phone_from_staff: false,
};

export default function PolicySettingsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["policy_settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("policy_settings")
        .select("*")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });

  const [form, setForm] = useState({ ...DEFAULTS });

  useEffect(() => {
    if (q.data) {
      const { tenant_id: _t, ...rest } = q.data;
      setForm({ ...DEFAULTS, ...rest });
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      const { error } = await supabase
        .from("policy_settings")
        .upsert({ tenant_id: tenantId, ...form }, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Policy settings saved");
      qc.invalidateQueries({ queryKey: ["policy_settings", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const num = (label: string, key: keyof typeof form, hint?: string, suffix?: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          min={0}
          value={form[key] as number}
          onChange={(e) => set(key, Number(e.target.value) as any)}
          className="w-32 rounded-md border px-3 py-2"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );

  const time = (label: string, key: keyof typeof form, hint?: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="time"
        value={String(form[key] ?? "").slice(0, 5)}
        onChange={(e) => set(key, e.target.value as any)}
        className="w-32 rounded-md border px-3 py-2"
      />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );

  return (
    <>
      <AppHeader
        title="Policies"
        subtitle="Deposits, cancellation windows, interest. Applied across bookings and invoices."
      />
      <div className="flex-1 p-6">
        <div className="sk-card max-w-3xl p-6 space-y-8">
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Hotel & Cattery</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {num("Deposit %", "hotel_deposit_percent", "Non-refundable deposit taken at booking", "%")}
              {num("Balance due (days before check-in)", "hotel_balance_due_days_before", undefined, "days")}
              {num("Free amendments", "hotel_free_amendments", "Before amendment fee kicks in")}
              {num("Amendment fee", "hotel_amendment_fee", "After free amendments used", "ZAR")}
              {num("Cancellation cutoff", "hotel_cancellation_cutoff_days", "Deposit forfeit inside this window", "days")}
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Balance reminders before arrival</span>
                <input
                  type="text"
                  value={(form.hotel_prearrival_reminder_days ?? []).join(", ")}
                  onChange={(e) =>
                    set(
                      "hotel_prearrival_reminder_days",
                      e.target.value
                        .split(",")
                        .map((s) => Number(s.trim()))
                        .filter((n) => Number.isFinite(n) && n > 0) as any,
                    )
                  }
                  className="w-40 rounded-md border px-3 py-2"
                  placeholder="3, 2, 1"
                />
                <span className="text-xs text-muted-foreground">
                  Days before check-in to email the outstanding balance. Comma separated.
                </span>
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Grooming</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {num("Cancellation notice", "grooming_cancellation_hours", "Fee applies inside this window", "hours")}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Daycare</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {num("Termination notice", "daycare_notice_months", "Notice period to end enrolment", "months")}
              {num("Catch-up window", "daycare_catchup_window_days", "Days to use missed days after absence", "days")}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Late collection</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {time("Collection cutoff", "late_pickup_cutoff_time", "Pets collected after this time are late")}
              {num("Grace period", "late_pickup_grace_minutes", "Free minutes after the cutoff", "minutes")}
              {num("Late collection fee", "late_pickup_fee_zar", "Flat fee once the grace period passes", "ZAR")}
              {num("Plus per 15 minutes", "late_pickup_fee_per_15min", "Charged on top of the flat fee", "ZAR")}
              {time("Converts to overnight after", "overnight_conversion_after_time", "Staff can convert the day into a boarding night")}
              {num("Overnight conversion rate", "overnight_conversion_rate_zar", "Boarding charge when a day converts", "ZAR")}
              {num("Abandonment after", "abandonment_hours", "No contact from the owner for this long", "hours")}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Transport & health</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {num("Collection radius", "transport_radius_km", "Maximum distance for pickup / drop-off", "km")}
              {num("Failed collection fee", "failed_collection_fee_zar", "Nobody home when the van arrives", "ZAR")}
              {num("On-arrival tick & flea treatment", "parasite_treatment_fee_zar", "Charged when proof of treatment is missing", "ZAR")}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Customer privacy</h2>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form.hide_customer_phone_from_staff)}
                onChange={(e) => set("hide_customer_phone_from_staff", e.target.checked as any)}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="font-medium">Hide customer phone numbers from staff</span>
                <span className="block text-xs text-muted-foreground">
                  Drivers, groomers and other work-mode staff stop seeing or calling client mobile numbers.
                  Only roles with "See customer phone numbers" (front desk, accounts, admins) keep access.
                </span>
              </span>
            </label>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Accounts</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {num("Overdue interest", "overdue_interest_percent_per_month", "Charged on overdue invoices", "% per month")}
              {num("Default annual increase", "annual_increase_percent", "Suggested percentage in the price increase tool", "%")}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Portal registration</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {num("Consent grace period", "consent_grace_days", "Existing customers can dismiss the registration wizard for this long before it becomes blocking.", "days")}
            </div>
          </section>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              className="sk-btn sk-btn-primary"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              <Save className="mr-2 h-4 w-4" />
              {save.isPending ? "Saving…" : "Save policies"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}