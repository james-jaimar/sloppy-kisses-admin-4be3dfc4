import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { Loader2, MapPin, Play, AlertCircle, CheckCircle2, Square, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { callBackfill } from "@/features/customers/addressSync";
import { useTenant } from "@/lib/tenant/TenantContext";

interface Totals {
  total: number;
  verified: number;
  unverified: number;
  failedFlagged: number;
}

interface FailureRow {
  id: string;
  formatted_address: string | null;
  verification_error: string | null;
  customer_id: string;
  customers: { full_name: string | null } | null;
}

export default function AddressVerificationPage() {
  const { tenantId } = useTenant();
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [session, setSession] = useState({ processed: 0, updated: 0, failed: 0 });
  const [failures, setFailures] = useState<FailureRow[]>([]);
  const stopRef = useRef(false);

  const loadTotals = async () => {
    if (!tenantId) return;
    const base = () => supabase.from("customer_addresses").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
    const [all, verified, failed] = await Promise.all([
      base(),
      base().not("google_place_id", "is", null),
      base().is("google_place_id", null).not("verification_failed_at", "is", null),
    ]);
    const total = all.count ?? 0;
    const ver = verified.count ?? 0;
    setTotals({ total, verified: ver, unverified: total - ver, failedFlagged: failed.count ?? 0 });
  };

  const loadFailures = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("customer_addresses")
      .select("id, formatted_address, verification_error, customer_id, customers(full_name)")
      .eq("tenant_id", tenantId)
      .is("google_place_id", null)
      .not("verification_failed_at", "is", null)
      .limit(200);
    setFailures((data as any[]) ?? []);
  };

  useEffect(() => {
    loadTotals();
    loadFailures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const run = async (retryFailures: boolean) => {
    stopRef.current = false;
    setRunning(true);
    setSession({ processed: 0, updated: 0, failed: 0 });
    try {
      // Keep asking for batches until nothing is left (or the user stops).
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await callBackfill({ retry_failures: retryFailures });
        setSession((s) => ({
          processed: s.processed + result.processed,
          updated: s.updated + result.updated,
          failed: s.failed + result.failed,
        }));
        setTotals(result.totals);
        if (stopRef.current) break;
        if (result.processed === 0) break;
        if (!retryFailures && result.remaining <= 0) break;
      }
      await loadFailures();
      toast.success("Address verification finished");
    } catch (e: any) {
      toast.error(e.message ?? "Backfill failed");
    } finally {
      setRunning(false);
      loadTotals();
    }
  };

  const pct = totals && totals.total > 0 ? Math.round((totals.verified / totals.total) * 100) : 0;

  return (
    <>
      <AppHeader
        title="Address verification"
        subtitle="Match saved addresses to Google Places and capture coordinates for routing."
      />
      <div className="flex-1 p-6">
        <div className="max-w-3xl space-y-6">
          {totals && (
            <div className="sk-card p-5">
              <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-lg font-bold">{totals.total}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">Total</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-lg font-bold text-green-600">{totals.verified}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">Verified</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-lg font-bold text-amber-600">{totals.unverified}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">Unverified</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-lg font-bold text-sk-coral-dark">{totals.failedFlagged}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">Failed</div>
                </div>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{pct}% verified</div>
            </div>
          )}

          <div className="sk-card p-5">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-sk-coral-soft text-sk-coral-dark">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold">Backfill legacy addresses</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This looks up every saved address that does not yet have a Google Place ID, writes the
                  verified coordinates, and updates the formatted address. It keeps running in small batches
                  until everything is done — you can stop it at any time and pick up later.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => run(false)}
                    disabled={running}
                    className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
                  >
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {running ? "Verifying…" : "Verify all addresses"}
                  </button>
                  {running && (
                    <button
                      onClick={() => {
                        stopRef.current = true;
                        toast.message("Stopping after this batch…");
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
                    >
                      <Square className="h-4 w-4" /> Stop
                    </button>
                  )}
                  {!running && (totals?.failedFlagged ?? 0) > 0 && (
                    <button
                      onClick={() => run(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
                    >
                      <RotateCcw className="h-4 w-4" /> Retry failures
                    </button>
                  )}
                </div>
                {(running || session.processed > 0) && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    This run: {session.processed} processed · {session.updated} verified · {session.failed} failed
                  </div>
                )}
              </div>
            </div>
          </div>

          {failures.length > 0 && (
            <div className="sk-card p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-sk-coral-dark">
                <AlertCircle className="h-4 w-4" /> Addresses Google could not match ({failures.length})
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Open the customer and re-pick the address using the Google search box to fix these.
              </p>
              <ul className="mt-3 divide-y divide-border text-sm">
                {failures.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <Link
                        to={`/admin/customers/${f.customer_id}`}
                        className="font-medium text-sk-coral-dark hover:underline"
                      >
                        {f.customers?.full_name ?? "Customer"}
                      </Link>
                      <div className="text-xs text-muted-foreground">{f.formatted_address ?? "—"}</div>
                    </div>
                    <div className="text-xs text-amber-700">{f.verification_error}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!running && totals && totals.unverified === 0 && (
            <div className="sk-card flex items-center gap-2 p-5 text-sm font-semibold text-green-700">
              <CheckCircle2 className="h-4 w-4" /> All saved addresses are verified.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
