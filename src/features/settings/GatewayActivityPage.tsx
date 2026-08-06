import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RefreshCw, FlaskConical, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";

const OUTCOME_STYLES: Record<string, string> = {
  accepted: "bg-sk-green/15 text-sk-green",
  dedup: "bg-muted text-muted-foreground",
  ignored: "bg-muted text-muted-foreground",
  received: "bg-amber-100 text-amber-700",
  bad_signature: "bg-destructive/10 text-destructive",
  not_validated: "bg-destructive/10 text-destructive",
  error: "bg-destructive/10 text-destructive",
};

function money(v: number | null | undefined) {
  if (v == null) return "—";
  return `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
}

export default function GatewayActivityPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission, profile } = useCurrentUser();
  const canManage = profile?.user_type === "platform" || hasPermission("settings.payment_providers.manage");
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [testInvoice, setTestInvoice] = useState("");
  const [testing, setTesting] = useState(false);
  const [replaying, setReplaying] = useState<string | null>(null);

  const eventsQ = useQuery({
    queryKey: ["payment_webhook_events", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_webhook_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["payment_attempts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_attempts")
        .select("*, invoice:invoices(invoice_number), customer:customers(full_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const unpaidQ = useQuery({
    queryKey: ["unpaid_invoices_for_test", tenantId],
    enabled: !!tenantId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, balance_due, status")
        .eq("tenant_id", tenantId!)
        .gt("balance_due", 0)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function sendTestItn() {
    if (!testInvoice) return;
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("payment-gateway-test-itn", {
        body: { invoice_id: testInvoice },
      });
      if (error) throw error;
      if ((data as any)?.ok) toast.success("Test notification accepted — payment recorded");
      else toast.error(`Webhook rejected it: ${(data as any)?.webhook_response ?? "unknown"}`);
      qc.invalidateQueries({ queryKey: ["payment_webhook_events"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Test failed");
    } finally {
      setTesting(false);
    }
  }

  async function replayItn(eventId: string) {
    setReplaying(eventId);
    try {
      const { data, error } = await supabase.functions.invoke("payment-gateway-replay-itn", {
        body: { event_id: eventId },
      });
      if (error) throw error;
      if ((data as any)?.ok) toast.success("Notification reprocessed — payment applied");
      else toast.error(`Still rejected: ${(data as any)?.webhook_response ?? "unknown"}`);
      qc.invalidateQueries({ queryKey: ["payment_webhook_events"] });
      qc.invalidateQueries({ queryKey: ["payment_attempts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Reprocess failed");
    } finally {
      setReplaying(null);
    }
  }

  async function sendTestItnLegacy() {
    if (!testInvoice) return;
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("payment-gateway-test-itn", {
        body: { invoice_id: testInvoice },
      });
      if (error) throw error;
      if ((data as any)?.ok) toast.success("Test notification accepted — payment recorded");
      else toast.error(`Webhook rejected it: ${(data as any)?.webhook_response ?? "unknown"}`);
      qc.invalidateQueries({ queryKey: ["payment_webhook_events"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <AppHeader
        title="Gateway activity"
        subtitle="Every payment notification PayFast sends us — including the ones we reject."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => { eventsQ.refetch(); attemptsQ.refetch(); }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <Link to="/admin/settings" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <ArrowLeft className="h-4 w-4" /> Back to settings
            </Link>
          </div>
        }
      />
      <div className="flex-1 space-y-6 p-4 md:p-6">
        {canManage && (
          <div className="sk-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-sk-coral-soft text-sk-coral-dark">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div className="min-w-[200px] flex-1">
                <div className="font-semibold">Send a test notification</div>
                <p className="text-xs text-muted-foreground">
                  Signs a PayFast-style notification with your saved credentials and pushes it through the live webhook.
                  Sandbox mode only — it records a real payment against the invoice you pick.
                </p>
              </div>
              <select
                value={testInvoice}
                onChange={(e) => setTestInvoice(e.target.value)}
                className="h-10 rounded-lg border border-border bg-white px-2 text-sm">
                <option value="">Choose an unpaid invoice…</option>
                {(unpaidQ.data ?? []).map((i: any) => (
                  <option key={i.id} value={i.id}>{i.invoice_number} · {money(i.balance_due)}</option>
                ))}
              </select>
              <button
                disabled={!testInvoice || testing}
                onClick={sendTestItn}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white disabled:opacity-50">
                {testing && <Loader2 className="h-4 w-4 animate-spin" />} Send test
              </button>
            </div>
          </div>
        )}

        <div className="sk-card overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Inbound notifications</div>
          {eventsQ.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (eventsQ.data ?? []).length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              Nothing received yet. If a customer has paid and nothing shows here, PayFast never reached us —
              check the notify URL on the PayFast account.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(eventsQ.data ?? []).map((e: any) => (
                <div key={e.id} className="px-4 py-3 text-sm">
                  <button
                    onClick={() => setOpen(open === e.id ? null : e.id)}
                    className="flex w-full items-center gap-3 text-left">
                    {open === e.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${OUTCOME_STYLES[e.outcome] ?? "bg-muted"}`}>
                      {String(e.outcome).replace("_", " ")}
                    </span>
                    <span className="font-medium">{money(e.amount_gross)}</span>
                    <span className="text-muted-foreground">{e.payment_status ?? "—"}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("en-ZA")}
                    </span>
                  </button>
                  {open === e.id && (
                    <div className="mt-3 space-y-2 rounded-lg bg-sk-surface-muted p-3 text-xs">
                      {e.error_text && <div className="text-destructive">{e.error_text}</div>}
                      <div className="text-muted-foreground">PayFast ref: <code>{e.pf_payment_id ?? "—"}</code></div>
                      <div className="text-muted-foreground">Invoice ref: <code>{e.m_payment_id ?? "—"}</code></div>
                      {canManage && e.raw_body && !["accepted", "dedup"].includes(String(e.outcome)) && (
                        <button
                          disabled={replaying === e.id}
                          onClick={() => replayItn(e.id)}
                          className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                          {replaying === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          Reprocess this notification
                        </button>
                      )}
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-white p-2">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sk-card overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Checkout attempts</div>
          {(attemptsQ.data ?? []).length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No one has been sent to the gateway yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {(attemptsQ.data ?? []).map((a: any) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${a.status === "completed" ? "bg-sk-green/15 text-sk-green" : "bg-amber-100 text-amber-700"}`}>
                    {a.status}
                  </span>
                  <span className="font-medium">{a.invoice?.invoice_number ?? "—"}</span>
                  <span>{money(a.amount)}</span>
                  <span className="text-muted-foreground">{a.customer?.full_name ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{a.origin === "customer_portal" ? "Portal" : "Invoice link"}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("en-ZA")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}