## Diagnosis

Your database row is correct — `profiles.user_type = 'platform'` for `james@jaimar.dev`. So the promotion did take effect at the DB level.

What you're seeing in the UI ("Tenant Owner" under your name, no Sys Dev pill) is almost certainly a **stale client cache**. `TenantContext` caches the full current-user payload — including `profile.user_type` — in `sessionStorage` under the key `sk.currentUserCache.v1`, and only refetches when the auth user id changes. Because your session was already signed in before the promotion migration ran, the cached copy still has your old `user_type` (`owner`/whatever), so:

- `isPlatform` evaluates to `false` in the browser
- The header shows `roles[0].label` ("Tenant Owner") — which, to be fair, it would show even for a platform owner today, because `roleLabel` always prefers the tenant role over the platform flag
- The `<RequirePlatform />` guard would bounce you to `/404` if you tried `/platform`

## Fix

Two small changes, no schema work:

1. **Bust the stale cache automatically.** Bump the cache key in `src/lib/tenant/TenantContext.tsx` from `sk.currentUserCache.v1` → `sk.currentUserCache.v2`. Any browser holding a pre-promotion payload will fall through to a fresh fetch on next load. Cheap, safe, one-line.

2. **Make the header honest about platform status.** In `src/components/layout/AppHeader.tsx`, when `profile.user_type === 'platform'`, show the role label as **"Platform · Sys Dev"** (or similar) instead of the tenant role. This is the label right under your name in the top-right menu — the thing you're reading as "tenant owner".

After these two changes, on your next page load you should see:

- Sys Dev pill visible in the header (already coded, just gated on the now-correct `isPlatform`)
- Role label under your name reads "Platform · Sys Dev"
- `/platform` is reachable

## Files touched

- `src/lib/tenant/TenantContext.tsx` — bump `CACHE_KEY`
- `src/components/layout/AppHeader.tsx` — platform-aware `roleLabel`

No migration, no data change, no new routes.
