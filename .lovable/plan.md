## Problem

Every time you switch tabs and come back, the app flashes "Loading profile…" and re-runs the whole auth + tenant bootstrap. Nothing about the user actually changed — it's a wiring bug, not a session length issue.

Supabase already keeps you signed in for a long time (refresh tokens auto-renew in the background, default ~1 hour access token with rolling refresh, persisted in localStorage). Making the session "longer" isn't the fix and isn't needed.

## Root cause

Two things compound on tab focus:

1. `supabase.auth.onAuthStateChange` fires events like `TOKEN_REFRESHED` / `SIGNED_IN` when the tab regains focus. `AuthContext` replaces the `session` state with a brand-new object even when the user id is identical.
2. `TenantContext`'s `load()` effect depends on the whole `authUser` object. When the session object changes identity, the effect re-runs, sets `loading: true`, and clears the profile/tenant/roles — so `RequireAdmin` renders the "Loading profile…" screen again for a second.

## Fix

Frontend-only, no schema or Supabase config changes.

### 1. `src/lib/auth/AuthContext.tsx`
- Keep the `onAuthStateChange` listener, but only update `session` state when the user id or access token actually changes. Ignore no-op events where `next?.user?.id === session?.user?.id` and the token is the same.
- This keeps `authUser` referentially stable across tab focus.

### 2. `src/lib/tenant/TenantContext.tsx`
- Change the load effect to depend on `authUser?.id` instead of the whole `authUser` object, so it only re-runs when the signed-in user actually changes.
- On subsequent runs for the same user (i.e. profile already loaded), do a silent background refresh: don't flip `loading` back to `true` and don't wipe existing `profile` / `memberships` / `currentTenant` / `roles` / `permissions`. Only clear state on sign-out.
- Guard against duplicate concurrent loads with a small in-flight ref.

### 3. `src/components/auth/RequireAdmin.tsx` and `RequireCustomer.tsx`
- Show the "Loading profile…" screen only when there is no cached profile yet (`loading && !profile`). Once we have a profile, render the app and let any background refresh happen invisibly.

### 4. Sanity pass across the app
Grep for other spots that gate rendering on `loading` from `useAuth` / `useCurrentUser` and apply the same "only block on first load" rule. Known candidates: `RequireAdmin`, `RequireCustomer`, `AppHeader` (already renders fine without blocking), any page that early-returns on `loading`.

## What this changes for the user

- Switching tabs and coming back: no more "Loading profile…" flash. The page stays as-is.
- Sign-in / sign-out / switching accounts: unchanged, still shows the loading state on the first load.
- Session length itself is untouched — Supabase's built-in refresh already keeps you logged in for weeks as long as you visit occasionally.
