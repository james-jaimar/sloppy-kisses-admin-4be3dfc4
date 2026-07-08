import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useInvoicingSettings, useUpdateInvoicingSettings } from "@/features/invoices/queries";

const PERMISSION = "settings.invoicing.manage";

export default function InvoicingSettingsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);

  const settingsQ = useInvoicingSettings(tenantId);
  const update = useUpdateInvoicingSettings(tenantId ?? "");

  const [form, setForm] = useState({
    company_name: "", vat_number: "", address: "", banking_details: "",
    invoice_prefix: "INV", next_number: 1, payment_terms_days: 14,
    default_vat_rate: 15, footer_notes: "", reminder_days: "3,7,14",
  });

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
      } as any);
      toast.success("Invoicing settings saved");
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
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