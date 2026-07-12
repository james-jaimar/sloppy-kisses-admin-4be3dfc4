import { useMemo, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "@/components/modals/ModalShell";
import { useUpsertPaymentProvider, type PaymentProviderRow } from "@/features/refunds/queries";

interface Props {
  tenantId: string;
  existing?: PaymentProviderRow;
  onClose: () => void;
}

/**
 * Per-tenant PayFast credentials editor. Values are stored in
 * `payment_providers.settings` jsonb (RLS-gated to tenant owner).
 * No env vars, no developer needed to rotate.
 */
export default function PayFastConnectDialog({ tenantId, existing, onClose }: Props) {
  const upsert = useUpsertPaymentProvider(tenantId);
  const settings = (existing?.settings ?? {}) as Record<string, any>;
  const [mode, setMode] = useState<"test" | "live">(existing?.mode ?? "test");
  const [merchantId, setMerchantId] = useState<string>(settings.merchant_id ?? "");
  const [merchantKey, setMerchantKey] = useState<string>(settings.merchant_key ?? "");
  const [passphrase, setPassphrase] = useState<string>(settings.passphrase ?? "");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);

  const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
  const notifyUrl = useMemo(
    () => `${supabaseUrl}/functions/v1/payment-gateway-webhook?provider=payfast`,
    [supabaseUrl],
  );
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const returnUrl = `${origin}/pay/success`;
  const cancelUrl = `${origin}/pay/cancel`;

  async function save(enable: boolean) {
    if (!merchantId.trim() || !merchantKey.trim()) {
      toast.error("Merchant ID and Merchant Key are required.");
      return;
    }
    setSaving(true);
    try {
      await upsert.mutateAsync({
        provider: "payfast",
        enabled: enable,
        mode,
        settings: {
          merchant_id: merchantId.trim(),
          merchant_key: merchantKey.trim(),
          passphrase: passphrase.trim() || null,
          notify_url: notifyUrl,
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      } as any);
      toast.success(enable ? "PayFast connected and enabled" : "PayFast credentials saved");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={existing?.settings?.merchant_id ? "Edit PayFast connection" : "Connect PayFast"}
      subtitle="Credentials are stored per-tenant. Find them in your PayFast dashboard → Settings → Integration."
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <button onClick={onClose} className="h-9 rounded-lg border border-border bg-white px-4 text-xs font-semibold">Cancel</button>
          <div className="flex gap-2">
            <button disabled={saving} onClick={() => save(false)}
              className="h-9 rounded-lg border border-border bg-white px-4 text-xs font-semibold disabled:opacity-50">
              Save (leave disabled)
            </button>
            <button disabled={saving} onClick={() => save(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-sk-green px-4 text-xs font-semibold text-white disabled:opacity-50">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Save & enable
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 p-5">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Environment</label>
            <div className="mt-2 flex gap-2">
              {(["test", "live"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`h-9 rounded-lg px-3 text-xs font-semibold ${mode === m ? "bg-foreground text-white" : "border border-border bg-white"}`}>
                  {m === "test" ? "Sandbox" : "Live"}
                </button>
              ))}
            </div>
            {mode === "test" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Sandbox uses <code>sandbox.payfast.co.za</code>. Test cards work; no real money moves.
              </p>
            )}
          </div>

          <Field label="Merchant ID" value={merchantId} onChange={setMerchantId} placeholder="10000100" />
          <Field label="Merchant Key" value={merchantKey} onChange={setMerchantKey} placeholder="46f0cd694581a" />
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Passphrase <span className="normal-case text-muted-foreground/70">(optional — must match your PayFast dashboard)</span>
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type={showPass ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="h-10 flex-1 rounded-lg border border-border bg-white px-3 text-sm"
                placeholder="Leave blank if no passphrase set"
              />
              <button type="button" onClick={() => setShowPass((s) => !s)}
                className="h-10 rounded-lg border border-border bg-white px-3 text-xs">
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-sk-surface-muted p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paste these into PayFast → Settings → Integration</div>
            <UrlRow label="Notify (ITN) URL" value={notifyUrl} />
            <UrlRow label="Return URL" value={returnUrl} />
            <UrlRow label="Cancel URL" value={cancelUrl} />
          </div>
      </div>
    </ModalShell>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
    </div>
  );
}

function UrlRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 first:mt-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 truncate rounded-md border border-border bg-white px-2 py-1.5 text-[11px]">{value}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-white px-2 text-[11px]">
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
    </div>
  );
}