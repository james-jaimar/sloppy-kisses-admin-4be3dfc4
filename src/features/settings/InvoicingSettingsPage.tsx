import { useEffect, useState } from "react";
import { Save, Play } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useInvoicingSettings, useUpdateInvoicingSettings } from "@/features/invoices/queries";
import { supabase } from "@/integrations/supabase/client";

const PERMISSION = "settings.invoicing.manage";
const RUN_PERMISSION = "invoicing.run_monthly";

export default function InvoicingSettingsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);
  const canRun = hasPermission(RUN_PERMISSION);

  const settingsQ = useInvoicingSettings(tenantId);
  const update = useUpdateInvoicingSettings(tenantId ?? "");

  const [form, setForm] = useState({
    company_name: "", vat_number: "", address: "", banking_details: "",
    invoice_prefix: "INV", next_number: 1, payment_terms_days: 14,
    default_vat_rate: 15, footer_notes: "", reminder_days: "3,7,14",
    prices_include_vat: false,
    auto_invoice_daycare: true, auto_invoice_hotel: true,
    auto_invoice_grooming: true, auto_invoice_transport: true,
    billing_cycle: "monthly_prepaid", billing_run_day: 22, billing_due_day: 1,
  });
  const nextMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); })();
  const [runPeriod, setRunPeriod] = useState<string>(nextMonth);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const d = settingsQ.data;
    if (d) {
      setForm({
        company_name: d.company_name ?? "",
        vat_number: d.vat_number ?? "",
        address: d.address ?? "",
        banking_details: d.banking_details ?? "",
        invoice_prefix: d.invoice_prefix ?? "INV",
        next_number: Number(d.next_number ?? 1),
        payment_terms_days: Number(d.payment_terms_days ?? 14),
        default_vat_rate: Number(d.default_vat_rate ?? 15),
        footer_notes: d.footer_notes ?? "",
        reminder_days: (d.reminder_days ?? [3, 7, 14]).join(","),
        prices_include_vat: !!(d as any).prices_include_vat,
        auto_invoice_daycare:   (d as any).auto_invoice_daycare   ?? true,
        auto_invoice_hotel:     (d as any).auto_invoice_hotel     ?? true,
        auto_invoice_grooming:  (d as any).auto_invoice_grooming  ?? true,
        auto_invoice_transport: (d as any).auto_invoice_transport ?? true,
        billing_cycle: (d as any).billing_cycle ?? "monthly_prepaid",
        billing_run_day: Number((d as any).billing_run_day ?? 22),
        billing_due_day: Number((d as any).billing_due_day ?? 1),
      });
    }
  }, [settingsQ.data]);

  async function save() {
    try {
      const reminder_days = form.reminder_days
        .split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
      await update.mutateAsync({
        company_name: form.company_name || null,
        vat_number: form.vat_number || null,
        address: form.address || null,
        banking_details: form.banking_details || null,
        invoice_prefix: form.invoice_prefix || "INV",
        next_number: form.next_number,
        payment_terms_days: form.payment_terms_days,
        default_vat_rate: form.default_vat_rate,
        footer_notes: form.footer_notes || null,
        reminder_days,
        prices_include_vat: form.prices_include_vat,
        auto_invoice_daycare: form.auto_invoice_daycare,
        auto_invoice_hotel: form.auto_invoice_hotel,
        auto_invoice_grooming: form.auto_invoice_grooming,
        auto_invoice_transport: form.auto_invoice_transport,
        billing_cycle: form.billing_cycle,
        billing_run_day: form.billing_run_day,
        billing_due_day: form.billing_due_day,
      } as any);
      toast.success("Invoicing settings saved");
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  async function runMonthly() {
    if (!tenantId) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc("generate_monthly_daycare_invoices" as any, {
        p_tenant_id: tenantId, p_period_start: runPeriod,
      });
      if (error) throw error;
      const r: any = data ?? {};
      toast.success(`Monthly run complete — ${r.created_invoices ?? 0} new draft invoice(s), ${r.added_lines ?? 0} line(s) added.`);
    } catch (err: any) {
      toast.error(err?.message ?? "Monthly run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <AppHeader title="Invoicing settings" subtitle="Company details, invoice numbering, VAT, reminders." />
      <div className="flex-1 p-6">
        <div className="sk-card max-w-3xl p-6 space-y-6">
          {!canManage && (
            <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
              Read-only. Only staff with the "Manage invoicing settings" permission can save changes.
            </div>
          )}

          <Section title="Company">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name">
                <input disabled={!canManage} value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
              <Field label="VAT number">
                <input disabled={!canManage} value={form.vat_number}
                  onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <textarea disabled={!canManage} rows={2} value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
              </Field>
              <Field label="Banking details (shown on invoice)" className="sm:col-span-2">
                <textarea disabled={!canManage} rows={3} value={form.banking_details}
                  onChange={(e) => setForm({ ...form, banking_details: e.target.value })}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
              </Field>
            </div>
          </Section>

          <Section title="Numbering & terms">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Invoice prefix" hint="e.g. INV, SK">
                <input disabled={!canManage} value={form.invoice_prefix}
                  onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
              <Field label="Next number" hint="Next invoice will use this integer.">
                <input type="number" min={1} disabled={!canManage} value={form.next_number}
                  onChange={(e) => setForm({ ...form, next_number: Number(e.target.value) })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
              <Field label="Default payment terms (days)">
                <input type="number" min={0} disabled={!canManage} value={form.payment_terms_days}
                  onChange={(e) => setForm({ ...form, payment_terms_days: Number(e.target.value) })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
              <Field label="Default VAT rate (%)">
                <input type="number" min={0} step="0.01" disabled={!canManage} value={form.default_vat_rate}
                  onChange={(e) => setForm({ ...form, default_vat_rate: Number(e.target.value) })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
              <Field label="Prices include VAT">
                <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm">
                  <input type="checkbox" disabled={!canManage} checked={form.prices_include_vat}
                    onChange={(e) => setForm({ ...form, prices_include_vat: e.target.checked })} />
                  <span className="text-xs text-muted-foreground">New line unit prices are VAT-inclusive by default</span>
                </label>
              </Field>
              <Field label="Reminder cadence (days after due)" hint="Comma-separated, e.g. 3,7,14" className="sm:col-span-2">
                <input disabled={!canManage} value={form.reminder_days}
                  onChange={(e) => setForm({ ...form, reminder_days: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
            </div>
          </Section>

          <Section title="Footer">
            <Field label="Footer / notes on invoice">
              <textarea disabled={!canManage} rows={3} value={form.footer_notes}
                onChange={(e) => setForm({ ...form, footer_notes: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            </Field>
          </Section>

          <Section title="Auto-invoicing">
            <p className="mb-3 text-xs text-muted-foreground">
              When on, a draft invoice is created automatically the moment a new enrolment or booking is added.
              Staff still review line items and click Issue before anything is sent to the customer.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ["auto_invoice_daycare",   "Daycare enrolments"],
                ["auto_invoice_hotel",     "Hotel bookings"],
                ["auto_invoice_grooming",  "Grooming bookings"],
                ["auto_invoice_transport", "Transport bookings"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-sm">
                  <span>{label}</span>
                  <input type="checkbox" disabled={!canManage}
                    checked={(form as any)[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked } as any)} />
                </label>
              ))}
            </div>
          </Section>

          <Section title="Billing cycle">
            <p className="mb-3 text-xs text-muted-foreground">
              Controls how recurring services (daycare) are billed. In monthly prepaid mode, invoices are raised on the run day and cover the following month, with payment due by the due day of the covered month.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Cycle mode">
                <select disabled={!canManage} value={form.billing_cycle}
                  onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
                  <option value="monthly_prepaid">Monthly prepaid</option>
                  <option value="ad_hoc">Ad-hoc only</option>
                </select>
              </Field>
              <Field label="Run day (of previous month)" hint="Day of month invoices are raised.">
                <input type="number" min={1} max={28} disabled={!canManage} value={form.billing_run_day}
                  onChange={(e) => setForm({ ...form, billing_run_day: Number(e.target.value) })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
              <Field label="Due day (of covered month)" hint="Day of the covered month the payment is due.">
                <input type="number" min={1} max={28} disabled={!canManage} value={form.billing_due_day}
                  onChange={(e) => setForm({ ...form, billing_due_day: Number(e.target.value) })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
            </div>

            <div className="mt-5 rounded-lg border border-dashed border-border bg-sk-surface-muted/30 p-4">
              <div className="mb-2 text-sm font-semibold">Run monthly daycare billing</div>
              <p className="mb-3 text-xs text-muted-foreground">
                Adds a draft line per active daycare enrolment for the chosen month. Safe to click twice — duplicate lines are skipped.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Billing period start" className="min-w-[180px]">
                  <input type="date" value={runPeriod}
                    onChange={(e) => setRunPeriod(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                </Field>
                <button disabled={!canRun || running || !runPeriod} onClick={runMonthly}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-teal px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  <Play className="h-4 w-4" /> {running ? "Running…" : "Run for this month"}
                </button>
                {!canRun && (
                  <span className="text-xs text-muted-foreground">Requires the "Run monthly billing" permission.</span>
                )}
              </div>
            </div>
          </Section>

          <div className="flex justify-end">
            <button disabled={!canManage || update.isPending} onClick={save}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
              <Save className="h-4 w-4" /> Save changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={"block " + (className ?? "")}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </label>
  );
}