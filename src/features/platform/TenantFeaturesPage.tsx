import { useEffect, useState } from "react";
import { Loader2, Lock, PackageCheck } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { FEATURE_CATALOG } from "@/lib/features/catalog";
import { useAllTenants, useSetTenantFeature, useTenantFeatures } from "./queries";

export default function TenantFeaturesPage() {
  const tenants = useAllTenants();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const features = useTenantFeatures(tenantId);
  const setFeature = useSetTenantFeature();

  useEffect(() => {
    if (!tenantId && tenants.data?.length) setTenantId(tenants.data[0].id);
  }, [tenants.data, tenantId]);

  const rows = features.data ?? [];
  const isOn = (key: string, fallback: boolean) => {
    const row = rows.find((r) => r.feature_key === key);
    return row ? row.enabled : fallback;
  };

  return (
    <>
      <AppHeader
        title="Tenant features"
        subtitle="Switch paid modules on or off per tenant. Foundation modules are always included."
      />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="sk-card p-4">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Tenant</label>
          <select
            value={tenantId ?? ""}
            onChange={(e) => setTenantId(e.target.value || null)}
            className="h-10 w-full max-w-md rounded-lg border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sk-coral/40"
          >
            {(tenants.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {(features.isLoading || tenants.isLoading) && (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          {FEATURE_CATALOG.map((f) => {
            const on = isOn(f.key, f.defaultEnabled);
            return (
              <div key={f.key} className="sk-card flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {f.sellable ? <Lock className="h-4 w-4 text-sk-coral" /> : <PackageCheck className="h-4 w-4 text-muted-foreground" />}
                      {f.label}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{f.key}</div>
                  </div>
                  {f.sellable ? (
                    <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!tenantId || setFeature.isPending}
                        onChange={(e) =>
                          setFeature.mutate({ tenantId: tenantId!, featureKey: f.key, enabled: e.target.checked })
                        }
                      />
                      <span className="text-xs font-medium">{on ? "On" : "Off"}</span>
                    </label>
                  ) : (
                    <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      Included
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{f.description}</p>
                <p className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">When off: </span>
                  {f.whenOff}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
