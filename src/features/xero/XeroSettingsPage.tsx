import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw, PlugZap, Users, FileText, ListChecks, Link2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import {
  useXeroSettings, useSaveXeroSettings, useXeroOrganisations, useXeroTest,
  useXeroPush, useXeroBackfillCounts, fetchBackfillIds, useXeroRunQueue, useXeroQueue,
  useXeroTaxRates, type XeroTaxRate,
} from "./queries";

const SERVICES: { key: string; label: string }[] = [
  { key: "daycare", label: "Daycare" },
  { key: "daycare_assessment", label: "Daycare assessment" },
  { key: "hotel_dog", label: "Hotel (dogs)" },
  { key: "hotel_cat", label: "Cattery" },
  { key: "grooming_inhouse", label: "Grooming (in-house)" },
  { key: "grooming_mobile", label: "Grooming (mobile)" },
  { key: "pickup_dropoff", label: "Pick-up / drop-off" },
];

const PAYMENT_METHODS = ["eft", "cash", "card", "yoko", "payfast", "other"];

const input = "h-10 w-full rounded-xl border border-border bg-white px-3 text-sm";
const label = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export default function XeroSettingsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission, profile } = useCurrentUser();
  const canManage = profile?.user_type === "platform" || hasPermission("settings.xero.manage");

  const settingsQ = useXeroSettings(tenantId);
  const save = useSaveXeroSettings(tenantId);
  const orgs = useXeroOrganisations(tenantId);
  const test = useXeroTest(tenantId);
  const push = useXeroPush(tenantId);
  const runQueue = useXeroRunQueue(tenantId);
  const queueQ = useXeroQueue(tenantId);
  const taxRates = useXeroTaxRates(tenantId);

  const [form, setForm] = useState<any>(null);
  const [orgList, setOrgList] = useState<Array<{ tenantId: string; tenantName: string }>>([]);
  const [fromDate, setFromDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10));
  const [progress, setProgress] = useState<string | null>(null);
  const [rateList, setRateList] = useState<XeroTaxRate[]>([]);
  const counts = useXeroBackfillCounts(tenantId, fromDate);

  useEffect(() => {
    if (settingsQ.data) setForm(settingsQ.data);
    else if (settingsQ.isFetched && !settingsQ.data) {
      setForm({
        enabled: false, auto_push: false, xero_tenant_id: null, xero_tenant_name: null,
        default_sales_account: "200", service_account_codes: {}, default_tax_type: "OUTPUT3",
        zero_rated_tax_type: "ZERORATED", line_amount_type: "Inclusive", payment_accounts: {},
      });
    }
  }, [settingsQ.data, settingsQ.isFetched]);

  const set = (patch: Record<string, unknown>) => setForm((f: any) => ({ ...f, ...patch }));

  async function onSave() {
    if (!canManage || !form) return;
    try {
      await save.mutateAsync({
        enabled: form.enabled, auto_push: form.auto_push,
        xero_tenant_id: form.xero_tenant_id, xero_tenant_name: form.xero_tenant_name,
        default_sales_account: form.default_sales_account || "200",
        service_account_codes: form.service_account_codes ?? {},
        default_tax_type: form.default_tax_type, zero_rated_tax_type: form.zero_rated_tax_type,
        line_amount_type: form.line_amount_type, payment_accounts: form.payment_accounts ?? {},
      });
      toast.success("Xero settings saved");
    } catch (e: any) { toast.error(e?.message ?? "Failed to save"); }
  }

  async function loadOrgs() {
    try {
      const list = await orgs.mutateAsync();
      setOrgList(list);
      if (!list.length) toast.error("No Xero organisations are visible to this connection.");
    } catch (e: any) { toast.error(e?.message ?? "Could not reach Xero"); }
  }

  async function onTest() {
    try {
      const res = await test.mutateAsync();
      toast.success(`Connected to ${res.organisation}`);
    } catch (e: any) { toast.error(e?.message ?? "Connection test failed"); }
  }

  async function loadTaxRates() {
    try {
      const list = await taxRates.mutateAsync();
      setRateList(list);
      if (!list.length) toast.error("Xero returned no sales tax rates for this organisation.");
      else toast.success(`${list.length} tax rates loaded from Xero`);
    } catch (e: any) { toast.error(e?.message ?? "Could not load tax rates"); }
  }

  function taxSelect(field: "default_tax_type" | "zero_rated_tax_type") {
    const current = form?.[field] ?? "";
    const known = rateList.some((r) => r.taxType === current);
    return (
      <select className={input} value={current} disabled={!canManage || !rateList.length}
        onChange={(e) => set({ [field]: e.target.value })}>
        {!rateList.length && <option value={current}>{current || "Load tax rates first"}</option>}
        {rateList.length > 0 && !known && current && <option value={current}>{current} (not in Xero)</option>}
        {rateList.map((r) => (
          <option key={r.taxType} value={r.taxType}>{r.name} — {r.rate}% ({r.taxType})</option>
        ))}
      </select>
    );
  }

  async function backfill(kind: "customers" | "invoices") {
    if (!tenantId) return;
    try {
      const ids = await fetchBackfillIds(tenantId, kind, fromDate);
      if (!ids.length) { toast.info("Nothing left to push."); return; }
      let ok = 0, failed = 0;
      const size = 20;
      for (let i = 0; i < ids.length; i += size) {
        setProgress(`Pushing ${Math.min(i + size, ids.length)} of ${ids.length} ${kind}…`);
        const res = await push.mutateAsync({
          entity_type: kind === "customers" ? "customer" : "invoice",
          entity_ids: ids.slice(i, i + size),
        });
        ok += res.succeeded ?? 0; failed += res.failed ?? 0;
      }
      setProgress(null);
      counts.refetch();
      if (failed) toast.error(`${ok} pushed, ${failed} failed — see the Xero sync log.`);
      else toast.success(`${ok} ${kind} pushed to Xero.`);
    } catch (e: any) { setProgress(null); toast.error(e?.message ?? "Push failed"); }
  }

  const pendingQueue = useMemo(() => (queueQ.data ?? []).length, [queueQ.data]);

  return (
    <>
      <AppHeader
        title="Xero"
        subtitle="Push customers, invoices, payments and credit notes into Xero."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/admin/settings/xero-customers" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <Users className="h-4 w-4" /> Xero customers
            </Link>
            <Link to="/admin/settings/billing-item-codes" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <Link2 className="h-4 w-4" /> Item codes
            </Link>
            <Link to="/admin/settings/xero-log" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <ListChecks className="h-4 w-4" /> Sync log
            </Link>
            <Link to="/admin/settings" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <ArrowLeft className="h-4 w-4" /> Back to settings
            </Link>
          </div>
        }
      />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        {!form || settingsQ.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {/* Connection */}
            <div className="sk-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold"><PlugZap className="h-4 w-4" /> Connection</div>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Choose which Xero organisation this system posts into. Everything below only applies to that organisation.
                  </p>
                </div>
                <button onClick={onTest} disabled={!canManage || !form.xero_tenant_id || test.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-semibold disabled:opacity-50">
                  {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Test connection
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <div className={label}>Xero organisation</div>
                  <select className={input} value={form.xero_tenant_id ?? ""} disabled={!canManage}
                    onChange={(e) => {
                      const chosen = orgList.find((o) => o.tenantId === e.target.value);
                      set({ xero_tenant_id: e.target.value || null, xero_tenant_name: chosen?.tenantName ?? form.xero_tenant_name });
                    }}>
                    <option value="">{form.xero_tenant_name ? `${form.xero_tenant_name} (saved)` : "Not selected"}</option>
                    {orgList.map((o) => <option key={o.tenantId} value={o.tenantId}>{o.tenantName}</option>)}
                    {form.xero_tenant_id && !orgList.some((o) => o.tenantId === form.xero_tenant_id) && (
                      <option value={form.xero_tenant_id}>{form.xero_tenant_name ?? form.xero_tenant_id}</option>
                    )}
                  </select>
                </div>
                <button onClick={loadOrgs} disabled={!canManage || orgs.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-semibold disabled:opacity-50">
                  {orgs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Load organisations
                </button>
              </div>

              {form.last_test_result && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Last test: {form.last_test_result}
                  {form.last_test_at ? ` · ${new Date(form.last_test_at).toLocaleString("en-ZA")}` : ""}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.enabled} disabled={!canManage}
                    onChange={(e) => set({ enabled: e.target.checked })} />
                  Xero sync enabled
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.auto_push} disabled={!canManage || !form.enabled}
                    onChange={(e) => set({ auto_push: e.target.checked })} />
                  Push new invoices, payments and credit notes automatically
                </label>
              </div>
            </div>

            {/* Account mapping */}
            <div className="sk-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">Account & tax mapping</div>
                  <p className="mt-1 text-sm text-muted-foreground">These must match the codes in Xero's chart of accounts.</p>
                </div>
                <button onClick={loadTaxRates} disabled={!canManage || !form.xero_tenant_id || taxRates.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-semibold disabled:opacity-50">
                  {taxRates.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Load tax rates
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className={label}>Default sales account</div>
                  <input className={input} value={form.default_sales_account ?? ""} disabled={!canManage}
                    onChange={(e) => set({ default_sales_account: e.target.value })} placeholder="200" />
                </div>
                <div>
                  <div className={label}>VAT tax type</div>
                  {taxSelect("default_tax_type")}
                  <p className="mt-1 text-xs text-muted-foreground">South Africa: "Standard Rate Sales" is 15% (OUTPUT3).</p>
                </div>
                <div>
                  <div className={label}>Zero-rated tax type</div>
                  {taxSelect("zero_rated_tax_type")}
                </div>
                <div>
                  <div className={label}>Prices are</div>
                  <select className={input} value={form.line_amount_type} disabled={!canManage}
                    onChange={(e) => set({ line_amount_type: e.target.value })}>
                    <option value="Inclusive">VAT inclusive</option>
                    <option value="Exclusive">VAT exclusive</option>
                    <option value="NoTax">No VAT</option>
                  </select>
                </div>
              </div>

              <div className="mt-5 text-sm font-semibold">Sales account per service (optional)</div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SERVICES.map((s) => (
                  <div key={s.key}>
                    <div className={label}>{s.label}</div>
                    <input className={input} disabled={!canManage}
                      value={form.service_account_codes?.[s.key] ?? ""}
                      placeholder={form.default_sales_account || "200"}
                      onChange={(e) => set({ service_account_codes: { ...(form.service_account_codes ?? {}), [s.key]: e.target.value } })} />
                  </div>
                ))}
              </div>

              <div className="mt-5 text-sm font-semibold">Bank account per payment method</div>
              <p className="text-xs text-muted-foreground">Payments recorded here post to these Xero accounts.</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {PAYMENT_METHODS.map((m) => (
                  <div key={m}>
                    <div className={label}>{m}</div>
                    <input className={input} disabled={!canManage}
                      value={form.payment_accounts?.[m] ?? ""} placeholder="e.g. 090"
                      onChange={(e) => set({ payment_accounts: { ...(form.payment_accounts ?? {}), [m]: e.target.value } })} />
                  </div>
                ))}
              </div>

              <div className="mt-5 flex justify-end">
                <button onClick={onSave} disabled={!canManage || save.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
                  {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save settings
                </button>
              </div>
            </div>

            {/* Backfill */}
            <div className="sk-card p-5">
              <div className="font-semibold">Push existing data</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Drafts are never sent. Only issued, part-paid and paid invoices go across.
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div>
                  <div className={label}>Invoices issued from</div>
                  <input type="date" className={input} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <button onClick={() => backfill("customers")} disabled={!canManage || !form.enabled || push.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-semibold disabled:opacity-50">
                  <Users className="h-4 w-4" /> Push customers ({counts.data?.customers ?? 0})
                </button>
                <button onClick={() => backfill("invoices")} disabled={!canManage || !form.enabled || push.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
                  <FileText className="h-4 w-4" /> Push invoices ({counts.data?.invoices ?? 0})
                </button>
              </div>
              {progress && (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {progress}
                </div>
              )}
              {!form.enabled && (
                <p className="mt-3 rounded-lg border border-dashed border-border bg-sk-surface-muted p-3 text-xs text-muted-foreground">
                  Turn on "Xero sync enabled" and save before pushing anything.
                </p>
              )}
            </div>

            {/* Queue */}
            <div className="sk-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">Auto-push queue</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {pendingQueue === 0 ? "Nothing waiting." : `${pendingQueue} item${pendingQueue === 1 ? "" : "s"} waiting or failed.`}
                  </p>
                </div>
                <button onClick={async () => {
                  try { const r = await runQueue.mutateAsync(); toast.success(`Processed ${r.processed} · ${r.done} sent · ${r.failed} failed`); }
                  catch (e: any) { toast.error(e?.message ?? "Queue run failed"); }
                }} disabled={!canManage || runQueue.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-semibold disabled:opacity-50">
                  {runQueue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Run now
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
