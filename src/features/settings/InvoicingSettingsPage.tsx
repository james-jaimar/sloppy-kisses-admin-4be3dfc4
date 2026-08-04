import { useEffect, useState } from "react";
import { Save, Play } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useInvoicingSettings, useUpdateInvoicingSettings } from "@/features/invoices/queries";
import { supabase } from "@/integrations/supabase/client";
import { emailIssuedInvoice } from "@/features/invoices/autoEmail";

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
    daycare_prorata_enabled: true,
    estimate_prefix: "QUO", next_estimate_number: 1,
  });
  const nextMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); })();
  const [runPeriod, setRunPeriod] = useState<string>(nextMonth);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<{ customers: number; lines: number; total: number; period_label: string } | null>(null);
  const [creditPreview, setCreditPreview] = useState<{ lines: number; total: number } | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [interestRunning, setInterestRunning] = useState(false);
  const [interestPreview, setInterestPreview] = useState<{ customers: number; total: number; percent: number } | null>(null);
  const [lastInterestRun, setLastInterestRun] = useState<string | null>(null);

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
        daycare_prorata_enabled: (d as any).daycare_prorata_enabled ?? true,
        estimate_prefix: (d as any).estimate_prefix ?? "QUO",
        next_estimate_number: Number((d as any).next_estimate_number ?? 1),
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
        daycare_prorata_enabled: form.daycare_prorata_enabled,
        estimate_prefix: form.estimate_prefix || "QUO",
        next_estimate_number: form.next_estimate_number,
      } as any);
      toast.success("Invoicing settings saved");
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  async function runMonthly() {
    if (!tenantId) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc("generate_monthly_daycare_invoices" as any, {
        p_tenant_id: tenantId, p_period_start: runPeriod, p_preview: false, p_issue: true,
      });
      if (error) throw error;
      const r: any = data ?? {};
      const ids: string[] = Array.isArray(r.invoice_ids) ? r.invoice_ids : [];
      let emailed = 0;
      for (const id of ids) {
        if (await emailIssuedInvoice(id)) emailed += 1;
      }
      setPreview(null);
      setLastRun(
        `${r.invoices ?? 0} invoice(s) created · ${r.lines ?? 0} line(s) · ${r.issued ?? 0} issued · ${emailed} emailed`,
      );
      toast.success(
        `Monthly run complete — ${r.invoices ?? 0} invoice(s), ${r.issued ?? 0} issued, ${emailed} emailed.`,
      );
    } catch (err: any) {
      toast.error(err?.message ?? "Monthly run failed");
    } finally {
      setRunning(false);
    }
  }

  async function previewMonthly() {
    if (!tenantId) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc("generate_monthly_daycare_invoices" as any, {
        p_tenant_id: tenantId, p_period_start: runPeriod, p_preview: true, p_issue: false,
      });
      if (error) throw error;
      const r: any = data ?? {};
      setPreview({
        customers: Number(r.customers ?? 0),
        lines: Number(r.lines ?? 0),
        total: Number(r.total ?? 0),
        period_label: r.period_label ?? "",
      });
      setCreditPreview({
        lines: Number(r.hotel_credit_lines ?? 0),
        total: Number(r.hotel_credit_total ?? 0),
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Preview failed");
    } finally {
      setRunning(false);
    }
  }

  async function runInterest(previewOnly: boolean) {
    if (!tenantId) return;
    setInterestRunning(true);
    try {
      const { data, error } = await supabase.rpc("charge_overdue_interest" as any, {
        p_tenant_id: tenantId,
        p_as_of: new Date().toISOString().slice(0, 10),
        p_preview: previewOnly,
      });
      if (error) throw error;
      const r: any = data ?? {};
      if (previewOnly) {
        setInterestPreview({
          customers: Number(r.customers ?? 0),
          total: Number(r.total ?? 0),
          percent: Number(r.percent ?? 0),
        });
        if (r.note) toast.info(r.note);
      } else {
        const ids: string[] = Array.isArray(r.invoice_ids) ? r.invoice_ids : [];
        let emailed = 0;
        for (const id of ids) if (await emailIssuedInvoice(id)) emailed += 1;
        setInterestPreview(null);
        setLastInterestRun(
          `${r.customers ?? 0} interest invoice(s) · R${Number(r.total ?? 0).toFixed(2)} · ${emailed} emailed`,
        );
        toast.success(`Interest raised for ${r.customers ?? 0} customer(s).`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Interest run failed");
    } finally {
      setInterestRunning(false);
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
              <Field label="Quote prefix" hint="e.g. QUO">
                <input disabled={!canManage} value={form.estimate_prefix}
                  onChange={(e) => setForm({ ...form, estimate_prefix: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
              <Field label="Next quote number">
                <input type="number" min={1} disabled={!canManage} value={form.next_estimate_number}
                  onChange={(e) => setForm({ ...form, next_estimate_number: Number(e.target.value) })}
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

            <label className="mt-4 flex items-start justify-between gap-4 rounded-lg border border-border bg-white px-3 py-2 text-sm">
              <span>
                Pro-rata mid-month daycare enrolments
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  When on, an enrolment starting after the 1st is invoiced immediately for only the
                  remaining attendance days of that month. When off, mid-month joiners simply wait for the
                  next monthly run.
                </span>
              </span>
              <input type="checkbox" disabled={!canManage} checked={form.daycare_prorata_enabled}
                onChange={(e) => setForm({ ...form, daycare_prorata_enabled: e.target.checked })} />
            </label>

            <div className="mt-5 rounded-lg border border-dashed border-border bg-sk-surface-muted/30 p-4">
              <div className="mb-2 text-sm font-semibold">Run monthly daycare billing</div>
              <p className="mb-3 text-xs text-muted-foreground">
                Daycare is the only service billed this way — every other booking invoices itself when it is made.
                This raises one invoice per customer for the chosen month, issues it and emails it. Preview first to
                check the totals. Safe to click twice — duplicate lines are skipped.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Billing period start" className="min-w-[180px]">
                  <input type="date" value={runPeriod}
                    onChange={(e) => { setRunPeriod(e.target.value); setPreview(null); }}
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                </Field>
                <button type="button" onClick={() => { setRunPeriod(nextMonth); setPreview(null); }}
                  className="inline-flex h-10 items-center rounded-lg border border-border bg-white px-3 text-sm hover:bg-muted">
                  Coming month
                </button>
                <button disabled={!canRun || running || !runPeriod} onClick={previewMonthly}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-sk-teal px-4 text-sm font-semibold text-sk-teal hover:bg-sk-teal/10 disabled:opacity-50">
                  {running ? "Working…" : "Preview"}
                </button>
                <button disabled={!canRun || running || !runPeriod} onClick={runMonthly}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-teal px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  <Play className="h-4 w-4" /> {running ? "Running…" : "Run, issue & email"}
                </button>
                {!canRun && (
                  <span className="text-xs text-muted-foreground">Requires the "Run monthly billing" permission.</span>
                )}
              </div>
              {preview && (
                <div className="mt-3 rounded-lg border border-border bg-white px-3 py-2 text-xs">
                  <span className="font-semibold">{preview.period_label}</span> — {preview.customers} customer(s),{" "}
                  {preview.lines} line(s), total{" "}
                  <span className="font-semibold">R{preview.total.toFixed(2)}</span>. Nothing has been created yet.
                  {creditPreview && creditPreview.lines > 0 && (
                    <div className="mt-1 text-sk-teal">
                      Includes {creditPreview.lines} hotel-stay credit line(s) worth −R{creditPreview.total.toFixed(2)}.
                    </div>
                  )}
                </div>
              )}
              {lastRun && (
                <div className="mt-3 rounded-lg border border-sk-teal/40 bg-sk-teal/5 px-3 py-2 text-xs text-sk-teal">
                  Last run: {lastRun}
                </div>
              )}
            </div>
          </Section>

          <Section title="Overdue interest run">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="mb-3 text-xs text-muted-foreground">
                Raises a separate interest invoice for every customer with an overdue balance, using the overdue
                interest rate in Policies. Customers on collections hold are skipped. Preview first.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <button disabled={!canRun || interestRunning} onClick={() => runInterest(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-sk-teal px-4 text-sm font-semibold text-sk-teal hover:bg-sk-teal/10 disabled:opacity-50">
                  {interestRunning ? "Working…" : "Preview interest"}
                </button>
                <button disabled={!canRun || interestRunning || !interestPreview?.customers} onClick={() => runInterest(false)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-teal px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  <Play className="h-4 w-4" /> {interestRunning ? "Running…" : "Raise & email interest"}
                </button>
              </div>
              {interestPreview && (
                <div className="mt-3 rounded-lg border border-border bg-white px-3 py-2 text-xs">
                  {interestPreview.customers} customer(s) at {interestPreview.percent}% per month — total{" "}
                  <span className="font-semibold">R{interestPreview.total.toFixed(2)}</span>. Nothing has been created yet.
                </div>
              )}
              {lastInterestRun && (
                <div className="mt-3 rounded-lg border border-sk-teal/40 bg-sk-teal/5 px-3 py-2 text-xs text-sk-teal">
                  Last run: {lastInterestRun}
                </div>
              )}
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