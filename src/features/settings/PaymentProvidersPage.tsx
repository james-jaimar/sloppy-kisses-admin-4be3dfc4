import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, CreditCard, Settings2, Activity } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { usePaymentProviders, useUpsertPaymentProvider, type PaymentProviderRow } from "@/features/refunds/queries";
import PayFastConnectDialog from "./PayFastConnectDialog";

type ProviderMeta = {
  code: string;
  label: string;
  description: string;
  status: "manual" | "coming-soon";
  ctaHint?: string;
};

const PROVIDERS: ProviderMeta[] = [
  {
    code: "manual",
    label: "Manual",
    description: "Cash, EFT, card machine, or any refund processed outside this system. Enabled by default so you can record refunds against payments today.",
    status: "manual",
  },
  {
    code: "payfast",
    label: "PayFast",
    description: "South Africa's most widely-integrated card & EFT gateway. Enter your merchant credentials to enable online invoice payments and one-click refunds.",
    status: "manual",
    ctaHint: "Recommended for South Africa",
  },
  {
    code: "yoco",
    label: "Yoco",
    description: "Yoco's card machine is a stand-alone terminal. API-based refunds are only available on Yoco Online / Yoco Business — worth checking Charlotte's plan before wiring up.",
    status: "coming-soon",
  },
  {
    code: "stripe",
    label: "Stripe",
    description: "Global card gateway. Useful if you take international cards or add subscriptions later.",
    status: "coming-soon",
  },
];

export default function PaymentProvidersPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission, profile } = useCurrentUser();
  const canManage = profile?.user_type === "platform" || hasPermission("settings.payment_providers.manage");
  const rowsQ = usePaymentProviders(tenantId);
  const upsert = useUpsertPaymentProvider(tenantId ?? "");
  const [payfastDialog, setPayfastDialog] = useState(false);

  const rowsByCode = new Map((rowsQ.data ?? []).map((r) => [r.provider, r]));

  async function toggleEnabled(code: string, current?: PaymentProviderRow) {
    if (!canManage) return;
    // PayFast needs credentials before it can be enabled.
    if (code === "payfast" && !(current?.settings as any)?.merchant_id && !current?.enabled) {
      setPayfastDialog(true);
      return;
    }
    try {
      await upsert.mutateAsync({
        provider: code,
        enabled: !(current?.enabled ?? false),
        mode: current?.mode ?? "test",
      });
      toast.success("Saved");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function setMode(code: string, current: PaymentProviderRow | undefined, mode: "test" | "live") {
    if (!canManage) return;
    try {
      await upsert.mutateAsync({ provider: code, enabled: current?.enabled ?? false, mode });
      toast.success("Saved");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <>
      <AppHeader
        title="Payment providers"
        subtitle="Manual refunds work today. Gateway integrations are scaffolded for future connect."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/admin/settings/gateway-activity" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <Activity className="h-4 w-4" /> Gateway activity
            </Link>
          </div>
        }
      />
      <div className="flex-1 p-6">
        {rowsQ.isLoading ? (
          <div className="flex items-center gap-2 py-20 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid gap-3">
            {PROVIDERS.map((p) => {
              const row = rowsByCode.get(p.code);
              const enabled = row?.enabled ?? (p.code === "manual");
              const isGateway = p.status === "coming-soon";
              const isPayfast = p.code === "payfast";
              const payfastConnected = isPayfast && Boolean((row?.settings as any)?.merchant_id);
              return (
                <div key={p.code} className="sk-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-xl bg-sk-coral-soft text-sk-coral-dark">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="font-semibold">{p.label}</div>
                          {p.ctaHint && (
                            <span className="rounded-full bg-sk-coral-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sk-coral-dark">
                              {p.ctaHint}
                            </span>
                          )}
                          {isGateway && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Coming soon
                            </span>
                          )}
                          {isPayfast && payfastConnected && (
                            <span className="rounded-full bg-sk-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sk-green">
                              Connected · {row?.mode === "live" ? "Live" : "Sandbox"}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{p.description}</p>
                        {isPayfast && payfastConnected && (
                          <p className="mt-1 text-xs text-muted-foreground">Merchant ID: <code>{(row?.settings as any).merchant_id}</code></p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isPayfast && canManage && (
                        <button onClick={() => setPayfastDialog(true)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold">
                          <Settings2 className="h-3.5 w-3.5" />
                          {payfastConnected ? "Edit credentials" : "Connect"}
                        </button>
                      )}
                      {row && (
                        <select
                          value={row.mode}
                          disabled={!canManage || isGateway || (isPayfast && !payfastConnected)}
                          onChange={(e) => setMode(p.code, row, e.target.value as any)}
                          className="h-9 rounded-lg border border-border bg-white px-2 text-xs">
                          <option value="test">Test</option>
                          <option value="live">Live</option>
                        </select>
                      )}
                      <button
                        disabled={!canManage || isGateway || (isPayfast && !payfastConnected)}
                        onClick={() => toggleEnabled(p.code, row)}
                        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                          enabled ? "bg-sk-green text-white" : "border border-border bg-white text-muted-foreground"
                        } disabled:cursor-not-allowed disabled:opacity-60`}>
                        {enabled ? "Enabled" : "Disabled"}
                      </button>
                    </div>
                  </div>
                  {isGateway && (
                    <div className="mt-3 rounded-lg border border-dashed border-border bg-sk-surface-muted p-3 text-xs text-muted-foreground">
                      Gateway wiring is stubbed and ready. When you connect this provider, the refund UI will call the gateway edge function
                      instead of writing manual rows — no changes needed elsewhere in the app.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {payfastDialog && tenantId && (
        <PayFastConnectDialog
          tenantId={tenantId}
          existing={rowsByCode.get("payfast")}
          onClose={() => setPayfastDialog(false)}
        />
      )}
    </>
  );
}