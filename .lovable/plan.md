# Fix: infinite recursion on `profiles` RLS

## Root cause

The `profiles_select_own_or_tenant` policy on `public.profiles` contains an `EXISTS` that joins back to `public.profiles` (as `p_self`) to find the caller's profile id. Postgres re-evaluates the same SELECT policy on that inner reference → infinite recursion. This fires as soon as `TenantContext` loads your profile after sign-in, which is why the app shows "Couldn't load your account".

This has nothing to do with password reset itself or the Site URL / Redirect URL settings — those are correct. The reset flow lands you signed in, then the profile load blows up.

## The fix (single Supabase migration)

Drop and recreate the `profiles` SELECT policy so it no longer references `profiles`. Use the existing `SECURITY DEFINER` helper `public.current_profile_id()` (which already reads `profiles` safely, bypassing RLS) to resolve the caller's profile id.

New policy body:

```text
auth_user_id = auth.uid()
OR is_platform_owner()
OR EXISTS (
  SELECT 1
  FROM public.tenant_users tu_self
  JOIN public.tenant_users tu_other
    ON tu_other.tenant_id = tu_self.tenant_id
  WHERE tu_self.profile_id = public.current_profile_id()
    AND tu_other.profile_id = profiles.id
)
```

`tenant_users` RLS uses `user_has_tenant_access()` which is also `SECURITY DEFINER`, so no further recursion.

## Scope

- One SQL migration on `public.profiles` — drop + recreate the SELECT policy only.
- No schema changes, no new tables, no code changes, no changes to Supabase auth settings, no changes to Site URL or Redirect URLs.
- INSERT / UPDATE policies on `profiles` are already recursion-safe and stay as-is.

## Verification after apply

1. Reload `/admin/dashboard` — the "Couldn't load your account" screen should be gone and the dashboard should render.
2. Re-run the forgot-password → reset-password flow end to end to confirm you land in the app cleanly.
