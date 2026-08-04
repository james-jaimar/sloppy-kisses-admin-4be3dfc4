import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  useBillingItemCodes, useSaveBillingItemCode, useDeleteBillingItemCode, useXeroPushItemCodes,
} from "@/features/xero/queries";

const PERMISSION = "settings.xero.manage";

/** Suggested SKUs so a new tenant is not staring at a blank screen. */
const SERVICE_DEFAULTS: { ref_key: string; label: string; code: string }[] = [
  { ref_key: "daycare", label: "Daycare", code: "DC-STD" },
  { ref_key: "daycare_assessment", label: "Daycare assessment", code: "DC-ASSESS" },
  { ref_key: "hotel_dog", label: "Hotel (dogs)", code: "HTL-DOG" },
  { ref_key: "hotel_cat", label: "Cattery", code: "HTL-CAT" },
  { ref_key: "grooming_inhouse", label: "Grooming (in-house)", code: "GRM-INH" },
  { ref_key: "grooming_mobile", label: "Grooming (mobile)", code: "GRM-VAN" },
  { ref_key: "pickup_dropoff", label: "Pick-up / drop-off", code: "TRN-PUD" },
];

const input = "h-10 w-full rounded-xl border border-border bg-white px-3 text-sm";
const label = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export default function BillingItemCodesPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission, profile } = useCurrentUser();
  const canManage = profile?.user_type === "platform" || hasPermission(PERMISSION);
  const confirm = useConfirm();

  const listQ = useBillingItemCodes(tenantId);
  const save = useSaveBillingItemCode(tenantId);
  const del = useDeleteBillingItemCode(tenantId);
  const pushItems = useXeroPushItemCodes(tenantId);

  const [newRow, setNewRow] = useState({ ref_key: "", label: "", code: "" });

  const rows = listQ.data ?? [];
  const byRef = useMemo(() => new Map(rows.map((r) => [`${r.kind}:${r.ref_key}`, r])), [rows]);
  const extras = rows.filter((r) => r.kind !== "service");

  async function setCode(kind: string, ref_key: string, labelText: string, code: string) {
    if (!canManage) return;
    try {
      await save.mutateAsync({ kind, ref_key, label: labelText, code: code.trim().toUpperCase(), active: true });
    } catch (e: any) { toast.error(e?.message ?? "Could not save"); }
  }

  async function seedDefaults() {
    for (const d of SERVICE_DEFAULTS) {
      if (byRef.has(`service:${d.ref_key}`)) continue;
      await setCode("service", d.ref_key, d.label, d.code);
    }
    toast.success("Default codes filled in — change any of them before pushing to Xero.");
  }

  async function addExtra() {
    if (!newRow.ref_key.trim() || !newRow.code.trim()) { toast.error("Give the item a key and a code."); return; }
    await setCode("custom", newRow.ref_key.trim(), newRow.label.trim() || newRow.ref_key.trim(), newRow.code);
    setNewRow({ ref_key: "", label: "", code: "" });
  }

  return (
    <>
      <AppHeader
        title="Billing item codes"
        subtitle="SKUs put on every invoice line and pushed to Xero as the item code."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                try { const r = await pushItems.mutateAsync(); toast.success(`${r.pushed ?? 0} item codes sent to Xero`); }
                catch (e: any) { toast.error(e?.message ?? "Could not push item codes"); }
              }}
              disabled={!canManage || pushItems.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
            >
              {pushItems.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Create these items in Xero
            </button>
            <Link to="/admin/settings" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <ArrowLeft className="h-4 w-4" /> Back to settings
            </Link>
          </div>
        }
      />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="sk-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Codes per service</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Every invoice line created from a booking picks up the code for that service.
              </p>
            </div>
            <button onClick={seedDefaults} disabled={!canManage}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-semibold disabled:opacity-50">
              Fill in suggested codes
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICE_DEFAULTS.map((s) => {
              const row = byRef.get(`service:${s.ref_key}`);
              return (
                <div key={s.ref_key}>
                  <div className={label}>{s.label}</div>
                  <input
                    className={input}
                    disabled={!canManage}
                    defaultValue={row?.code ?? ""}
                    placeholder={s.code}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v.toUpperCase() !== (row?.code ?? "")) setCode("service", s.ref_key, s.label, v);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="sk-card p-5">
          <div className="font-semibold">Other item codes</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Anything else you bill for — late fees, retail bundles, add-ons.
          </p>

          <div className="mt-4 space-y-2">
            {extras.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
                <div className="min-w-[10rem] flex-1 text-sm font-medium">{r.label}</div>
                <div className="text-xs text-muted-foreground">{r.ref_key}</div>
                <input className={`${input} w-40`} disabled={!canManage} defaultValue={r.code}
                  onBlur={(e) => e.target.value.trim() && setCode(r.kind, r.ref_key, r.label, e.target.value)} />
                <button
                  disabled={!canManage}
                  onClick={async () => {
                    if (!(await confirm({ title: "Delete item code?", description: `${r.label} (${r.code})`, confirmLabel: "Delete" }))) return;
                    await del.mutateAsync(r.id);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {!extras.length && <p className="text-sm text-muted-foreground">No extra codes yet.</p>}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-end">
            <div>
              <div className={label}>Key</div>
              <input className={input} value={newRow.ref_key} disabled={!canManage}
                placeholder="late_fee" onChange={(e) => setNewRow({ ...newRow, ref_key: e.target.value })} />
            </div>
            <div>
              <div className={label}>Name</div>
              <input className={input} value={newRow.label} disabled={!canManage}
                placeholder="Late cancellation fee" onChange={(e) => setNewRow({ ...newRow, label: e.target.value })} />
            </div>
            <div>
              <div className={label}>Code</div>
              <input className={input} value={newRow.code} disabled={!canManage}
                placeholder="FEE-LATE" onChange={(e) => setNewRow({ ...newRow, code: e.target.value })} />
            </div>
            <button onClick={addExtra} disabled={!canManage}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-semibold disabled:opacity-50">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>
      </div>
    </>
  );
}