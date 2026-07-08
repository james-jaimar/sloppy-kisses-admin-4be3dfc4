import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useRetailSettings, useUpdateRetailSettings } from "@/features/shop/queries";

export default function RetailSettingsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const settingsQ = useRetailSettings(tenantId);
  const update = useUpdateRetailSettings(tenantId ?? "");

  const [form, setForm] = useState({ default_vat_rate: 15, allow_negative_stock: false, low_stock_notify_emails: "" });

  useEffect(() => {
    const d = settingsQ.data;
    if (d) setForm({
      default_vat_rate: Number(d.default_vat_rate ?? 15),
      allow_negative_stock: !!d.allow_negative_stock,
      low_stock_notify_emails: d.low_stock_notify_emails ?? "",
    });
  }, [settingsQ.data]);

  async function save() {
    try {
      await update.mutateAsync({
        default_vat_rate: form.default_vat_rate,
        allow_negative_stock: form.allow_negative_stock,
        low_stock_notify_emails: form.low_stock_notify_emails || null,
      });
      toast.success("Retail settings saved");
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  return (
    <>
      <AppHeader title="Retail settings" subtitle="Default VAT, stock rules and low-stock notifications." />
      <div className="flex-1 p-6">
        <div className="sk-card max-w-2xl p-6 space-y-5">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Default VAT rate (%)</div>
            <input type="number" step="0.01" value={form.default_vat_rate}
              onChange={(e) => setForm({ ...form, default_vat_rate: Number(e.target.value) })}
              className="h-10 w-40 rounded-lg border border-border bg-white px-3 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.allow_negative_stock}
              onChange={(e) => setForm({ ...form, allow_negative_stock: e.target.checked })} />
            Allow sales that take stock below zero
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Low-stock notify emails</div>
            <input value={form.low_stock_notify_emails}
              onChange={(e) => setForm({ ...form, low_stock_notify_emails: e.target.value })}
              placeholder="ops@sloppykisses.co.za, buyer@…"
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            <div className="mt-1 text-[11px] text-muted-foreground">Comma-separated. Used by the low-stock digest.</div>
          </label>
          <div className="flex justify-end">
            <button onClick={save} disabled={update.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
              <Save className="h-4 w-4" /> Save changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}