import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useRetailSettings, useStockLocations, useUpdateRetailSettings } from "@/features/shop/queries";
import { useResources } from "@/features/bookings/queries";

export default function RetailSettingsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const settingsQ = useRetailSettings(tenantId);
  const update = useUpdateRetailSettings(tenantId ?? "");
  const locsQ = useStockLocations(tenantId);
  const resourcesQ = useResources(tenantId);
  const tills = (resourcesQ.data ?? []).filter((r) => r.type === "retail_till");

  const [form, setForm] = useState({ default_vat_rate: 15, allow_negative_stock: false, low_stock_notify_emails: "", till_name: "", receipt_footer: "", pos_location_id: "", pos_page_size: 24, unknown_barcode_action: "link" as "link" | "warn", scan_beep: true, till_resource_id: "" });

  useEffect(() => {
    const d = settingsQ.data;
    if (d) setForm({
      default_vat_rate: Number(d.default_vat_rate ?? 15),
      allow_negative_stock: !!d.allow_negative_stock,
      low_stock_notify_emails: d.low_stock_notify_emails ?? "",
      till_name: d.till_name ?? "",
      receipt_footer: d.receipt_footer ?? "",
      pos_location_id: d.pos_location_id ?? "",
      pos_page_size: Number(d.pos_page_size ?? 24),
      unknown_barcode_action: (d.unknown_barcode_action ?? "link") as "link" | "warn",
      scan_beep: d.scan_beep !== false,
      till_resource_id: d.till_resource_id ?? "",
    });
  }, [settingsQ.data]);

  async function save() {
    try {
      await update.mutateAsync({
        default_vat_rate: form.default_vat_rate,
        allow_negative_stock: form.allow_negative_stock,
        low_stock_notify_emails: form.low_stock_notify_emails || null,
        till_name: form.till_name || null,
        receipt_footer: form.receipt_footer || null,
        pos_location_id: form.pos_location_id || null,
        pos_page_size: form.pos_page_size,
        unknown_barcode_action: form.unknown_barcode_action,
        scan_beep: form.scan_beep,
        till_resource_id: form.till_resource_id || null,
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
          <div className="border-t border-border pt-5 space-y-5">
            <div className="text-sm font-semibold">Point of sale</div>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Till name</div>
              <input value={form.till_name}
                onChange={(e) => setForm({ ...form, till_name: e.target.value })}
                placeholder="Front desk till"
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              <div className="mt-1 text-[11px] text-muted-foreground">Shown on the till screen and printed on receipts.</div>
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Till stock location</div>
              <select value={form.pos_location_id}
                onChange={(e) => setForm({ ...form, pos_location_id: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
                <option value="">Use the default location</option>
                {(locsQ.data ?? []).map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>
              <div className="mt-1 text-[11px] text-muted-foreground">Stock sold at the till comes off this location.</div>
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Till resource</div>
              <select value={form.till_resource_id}
                onChange={(e) => setForm({ ...form, till_resource_id: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
                <option value="">Not linked to a till resource</option>
                {tills.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
              </select>
              <div className="mt-1 text-[11px] text-muted-foreground">Used to roster shop staff onto a specific register.</div>
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Products per page</div>
              <input type="number" min={8} max={60} value={form.pos_page_size}
                onChange={(e) => setForm({ ...form, pos_page_size: Number(e.target.value) })}
                className="h-10 w-40 rounded-lg border border-border bg-white px-3 text-sm" />
              <div className="mt-1 text-[11px] text-muted-foreground">How many tiles show on the till grid before paging. 24 suits most tablets.</div>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.scan_beep}
                onChange={(e) => setForm({ ...form, scan_beep: e.target.checked })} />
              Beep on every scan
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unrecognised barcode</div>
              <select value={form.unknown_barcode_action}
                onChange={(e) => setForm({ ...form, unknown_barcode_action: e.target.value as "link" | "warn" })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
                <option value="link">Open the link screen so staff can match it to a product</option>
                <option value="warn">Just warn — the code is queued for admin</option>
              </select>
              <div className="mt-1 text-[11px] text-muted-foreground">Only staff with the “link barcodes” permission can save a match; everyone else can flag it.</div>
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Receipt footer</div>
              <textarea value={form.receipt_footer} rows={3}
                onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
                placeholder="Thank you for shopping with us!"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            </label>
          </div>

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