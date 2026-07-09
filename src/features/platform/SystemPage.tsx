import { AppHeader } from "@/components/layout/AppHeader";
import { ExternalLink } from "lucide-react";

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
      </div>
    </>
  );
}