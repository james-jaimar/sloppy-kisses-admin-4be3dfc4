import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Loader2, MapPin, Play, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

export default function AddressVerificationPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ processed: number; updated: number; failed: number; errors: string[] } | null>(null);

  const runBackfill = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backfill-addresses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Backfill failed");
      setResult(json.result);
      toast.success(`Verified ${json.result.updated} of ${json.result.processed} addresses`);
    } catch (e: any) {
      toast.error(e.message ?? "Backfill failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <AppHeader
        title="Address verification"
        subtitle="Match saved addresses to Google Places and capture coordinates for routing."
      />
      <div className="flex-1 p-6">
        <div className="max-w-2xl space-y-6">
          <div className="sk-card p-5">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-sk-coral-soft text-sk-coral-dark">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold">Backfill legacy addresses</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This looks up each saved address that does not yet have a Google Place ID, writes the
                  verified coordinates, and updates the formatted address. It processes up to 25 addresses
                  per run and respects Google's rate limits.
                </p>
                <button
                  onClick={runBackfill}
                  disabled={running}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Run backfill
                </button>
              </div>
            </div>
          </div>

          {result && (
            <div className="sk-card p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Backfill complete
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-lg font-bold">{result.processed}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">Processed</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-lg font-bold text-green-600">{result.updated}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">Verified</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-lg font-bold text-sk-coral-dark">{result.failed}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">Failed</div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="mt-4 rounded-lg border border-sk-coral/20 bg-sk-coral-soft p-3 text-xs text-sk-coral-dark">
                  <div className="mb-2 flex items-center gap-1.5 font-semibold">
                    <AlertCircle className="h-3.5 w-3.5" /> Failures
                  </div>
                  <ul className="space-y-1">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
