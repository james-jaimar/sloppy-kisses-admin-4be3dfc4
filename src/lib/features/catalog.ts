/**
 * Sellable module catalog.
 *
 * Entitlements sit ABOVE permissions: a tenant must have the module switched on
 * AND the signed-in user must hold the permission. Platform owners always pass.
 *
 * `sellable: false` modules are foundation features that can never be switched
 * off (they are listed here so the Sys Dev screen can show them as included).
 */
export interface FeatureDef {
  key: string;
  label: string;
  /** What the tenant gets when it's on. */
  description: string;
  /** What they lose when it's off — shown in Sys Dev. */
  whenOff: string;
  defaultEnabled: boolean;
  sellable: boolean;
}

export const FEATURE_CATALOG: FeatureDef[] = [
  {
    key: "core.addresses",
    label: "Address capture & verification",
    description: "Google-backed address search, verified coordinates, unit / complex details.",
    whenOff: "Always included — cannot be switched off.",
    defaultEnabled: true,
    sellable: false,
  },
  {
    key: "vans.basic",
    label: "Mobile vans (basic)",
    description: "Van board, assigning bookings to a van, driver day view.",
    whenOff: "Always included in MVP 1 — cannot be switched off.",
    defaultEnabled: true,
    sellable: false,
  },
  {
    key: "vans.route_optimisation",
    label: "Route optimisation",
    description: "Automatically sequenced van routes using live drive times.",
    whenOff: "Staff assign and order van stops by hand. No optimise button, no drive-time estimates.",
    defaultEnabled: false,
    sellable: true,
  },
  {
    key: "integrations.xero",
    label: "Xero integration",
    description: "Push customers, invoices, payments and credit notes to Xero.",
    whenOff: "Xero settings, sync log, contact matching and every 'Sync to Xero' button disappear.",
    defaultEnabled: false,
    sellable: true,
  },
];

export const FEATURE = {
  addresses: "core.addresses",
  vansBasic: "vans.basic",
  routeOptimisation: "vans.route_optimisation",
  xero: "integrations.xero",
} as const;

export type FeatureKey = (typeof FEATURE)[keyof typeof FEATURE];

export function featureDefault(key: string): boolean {
  return FEATURE_CATALOG.find((f) => f.key === key)?.defaultEnabled ?? false;
}

export function isSellable(key: string): boolean {
  return FEATURE_CATALOG.find((f) => f.key === key)?.sellable ?? false;
}
