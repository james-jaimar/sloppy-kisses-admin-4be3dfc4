import { AppHeader } from "@/components/layout/AppHeader";
import { ExternalLink, Play, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const PROJECT_REF = "jsmsyezkfxtgmxvgfuxx";

const links = [
  { label: "SQL editor", href: `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new` },
  { label: "Auth users", href: `https://supabase.com/dashboard/project/${PROJECT_REF}/auth/users` },
  { label: "Auth providers", href: `https://supabase.com/dashboard/project/${PROJECT_REF}/auth/providers` },
  { label: "Edge functions", href: `https://supabase.com/dashboard/project/${PROJECT_REF}/functions` },
  { label: "Edge function secrets", href: `https://supabase.com/dashboard/project/${PROJECT_REF}/settings/functions` },
  { label: "Storage buckets", href: `https://supabase.com/dashboard/project/${PROJECT_REF}/storage/buckets` },
  { label: "invite-user logs", href: `https://supabase.com/dashboard/project/${PROJECT_REF}/functions/invite-user/logs` },
  { label: "send-notifications logs", href: `https://supabase.com/dashboard/project/${PROJECT_REF}/functions/send-notifications/logs` },
];

const expectedSecrets = [
  "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_JWKS", "LOVABLE_API_KEY",
];

function GoogleMapsSelfTest() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; checks: Array<{ name: string; ok: boolean; detail: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("google-maps-selftest", { body: {} });
      if (fnError) throw fnError;
      setResult(data as any);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="sk-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Google Maps self-test</h2>
          <p className="text-xs text-muted-foreground">Verifies Routes API and Route Optimization with the configured project.</p>
        </div>
        <Button type="button" size="sm" onClick={run} disabled={running}>
          {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
          Run test
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            {result.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
            {result.ok ? "All checks passed" : "Some checks failed"}
          </div>
          <ul className="divide-y rounded-lg border text-sm">
            {result.checks.map((c) => (
              <li key={c.name} className="flex items-start justify-between gap-3 p-2.5">
                <span className="text-muted-foreground">{c.name}</span>
                <span className={c.ok ? "text-green-700" : "text-red-700"}>{c.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function SystemPage() {
  return (
    <>
      <AppHeader title="System & secrets" subtitle="Deep-links into Supabase and the expected secrets checklist." />
      <div className="flex-1 p-6 space-y-6">
        <div className="sk-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Supabase</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <span>{l.label}</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>

        <div className="sk-card p-5">
          <h2 className="mb-1 text-sm font-semibold">Expected edge-function secrets</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Names only — values are never shown here. Manage them in Supabase → Edge functions → Settings.
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {expectedSecrets.map((s) => (
              <li key={s} className="rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs">{s}</li>
            ))}
          </ul>
        </div>

        <div className="sk-card p-5">
          <h2 className="mb-2 text-sm font-semibold">Project</h2>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div><span className="text-muted-foreground">Supabase ref:</span> <span className="font-mono">{PROJECT_REF}</span></div>
            <div><span className="text-muted-foreground">Preview:</span> <a className="text-sk-coral-dark hover:underline" href="https://id-preview--cf3d2f8a-678a-4ce0-bb85-8cad57de8703.lovable.app" target="_blank" rel="noopener noreferrer">open</a></div>
            <div><span className="text-muted-foreground">Published:</span> <a className="text-sk-coral-dark hover:underline" href="https://sloppykisses.lovable.app" target="_blank" rel="noopener noreferrer">sloppykisses.lovable.app</a></div>
          </div>
        </div>

        <GoogleMapsSelfTest />
      </div>
    </>
  );
}