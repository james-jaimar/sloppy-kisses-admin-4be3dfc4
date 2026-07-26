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

  const set = <K extends keyof typeof form>(k: K, v: number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const num = (label: string, key: keyof typeof form, hint?: string, suffix?: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          min={0}
          value={form[key]}
          onChange={(e) => set(key, Number(e.target.value))}
          className="w-32 rounded-md border px-3 py-2"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
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
            <h2 className="text-base font-semibold">Accounts</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {num("Overdue interest", "overdue_interest_percent_per_month", "Charged on overdue invoices", "% per month")}
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