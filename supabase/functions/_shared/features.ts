// Server-side entitlement guard. Mirrors src/lib/features/catalog.ts.
// A module that is off for a tenant must not be drivable from a stale tab.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SELLABLE_DEFAULTS: Record<string, boolean> = {
  "vans.route_optimisation": false,
  "integrations.xero": false,
};

export async function isFeatureEnabled(
  admin: SupabaseClient,
  tenantId: string,
  featureKey: string,
): Promise<boolean> {
  // Non-sellable modules are always included.
  if (!(featureKey in SELLABLE_DEFAULTS)) return true;
  const { data } = await admin
    .from("tenant_features")
    .select("enabled")
    .eq("tenant_id", tenantId)
    .eq("feature_key", featureKey)
    .maybeSingle();
  return data ? Boolean(data.enabled) : SELLABLE_DEFAULTS[featureKey];
}

export async function assertFeature(
  admin: SupabaseClient,
  tenantId: string,
  featureKey: string,
  label = featureKey,
): Promise<void> {
  if (!(await isFeatureEnabled(admin, tenantId, featureKey))) {
    throw new Error(`${label} is not enabled for this account.`);
  }
}
