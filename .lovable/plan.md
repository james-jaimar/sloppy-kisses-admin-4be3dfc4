# Feature gating: sell modules as phased add-ons

## What exists today

`platform_flags` is a global (not per-tenant) key/value table, currently empty, editable only from Sys Dev → Feature flags. Nothing in the app reads it, so it can't gate anything yet. Xero ships as three Settings pages plus "Sync to Xero" buttons on invoice and customer detail. Route optimisation isn't built yet.

## What I'll build

### 1. Per-tenant entitlements
A new `tenant_features` table (tenant + feature key + enabled), readable by that tenant's staff, writable only by platform owners. Global `platform_flags` stays as-is for dev flags; entitlements are what you sell.

A feature catalog defined in code so the Sys Dev screen always lists every sellable module, even before a tenant row exists:

| Key | Module | Default |
|---|---|---|
| `core.addresses` | Google address capture + verification | always on, not sellable |
| `vans.basic` | Mobile van board, assign bookings, driver view | always on in MVP 1 |
| `vans.route_optimisation` | Auto-sequenced, drive-time optimised routes | OFF |
| `integrations.xero` | Xero sync (settings, log, contact matching, push buttons) | ON for Sloppy Kisses |

The catalog is one file, so adding "customer portal" or "online payments" later as sellable modules is a one-line change — I'm just not gating them now.

### 2. Sys Dev control screen
New Sys Dev → **Tenant features** page: pick a tenant, see every module in the catalog with a toggle and a short description of what the tenant loses when it's off. Every change writes an audit row (who, what, when). Also reachable from the tenant row on Sys Dev → Tenants.

### 3. Gating in the app — hidden entirely
A `useFeature("key")` hook plus a `<Feature>` wrapper, mirroring how `Can`/permissions already work.

When a module is off, for that tenant:
- Its sidebar and Settings entries don't render.
- Its routes redirect to Home (so a pasted URL is a dead end, not a lock screen).
- Its buttons vanish — e.g. no "Sync to Xero" on invoices or customers.
- Server side: the matching edge functions refuse the call, so a disabled module can't be driven from a stale tab.

### 4. Address enforcement on mobile van bookings
Since address capture is the always-on foundation: a mobile van booking can't be confirmed without a verified Google address on the pet's collection point. Front desk gets a clear inline prompt with the address picker right there, plus an admin-only override for the rare address Google doesn't know, recorded on the booking.

### 5. Starting state
Sloppy Kisses: addresses on, van basics on, Xero on, route optimisation off. Route optimisation work then continues behind the gate — built, dormant, ready to switch on when it's paid for.

## Technical notes

- `tenant_features(tenant_id, feature_key, enabled, updated_at, updated_by)` with grants + RLS: select for tenant members, all for platform owners; writes audited to `platform_audit`.
- Entitlements load once in `TenantContext` alongside roles/permissions and cache with the existing session cache, so gating costs no extra round trip per page.
- Catalog lives in `src/lib/features/catalog.ts`; `useFeature` resolves catalog default → tenant row override, and returns true for platform owners.
- Route gating via a `RequireFeature` element wrapper alongside `RequirePermission` in `App.tsx`.
- Edge-function guard: a shared `assertFeature(tenantId, key)` helper used by `xero-sync` and, later, the route-optimisation function.
- No changes to existing permissions or roles — entitlements sit above them: a tenant must have the module AND the user must have the permission.
