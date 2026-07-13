## Goal

Fix two things in the branded invite/recovery emails:

1. The action link exposes `jsmsyezkfxtgmxvgfuxx.supabase.co` and lands on `sloppykisses.lovable.app`. It should stay on the tenant's own domain (e.g. `document-centre.com`).
2. The logo doesn't render — the `<img>` src is a bare storage path, not a URL Outlook can fetch.

## What to change

### 1. Route the action link through our own domain

Supabase's `generateLink` returns two things:
- `action_link` → `https://<project>.supabase.co/auth/v1/verify?token=…&redirect_to=…` (what we currently email)
- `hashed_token` → the raw one-time token

Instead of emailing `action_link`, we'll build our own URL:

```
https://<tenant-app-url>/auth/accept?token_hash=<hashed_token>&type=invite&next=/reset-password
```

Then add a small public route `/auth/accept` that calls `supabase.auth.verifyOtp({ token_hash, type })` and, on success, navigates to `next`. That call still hits Supabase under the hood but only from JS — the visible URL in the email is the tenant's domain, and after verification the user stays on that same domain (no `lovable.app` bounce).

Apply the same swap to the password-reset email.

### 2. Resolve the tenant app URL

Add an `app_url` column to `public.tenants` (nullable text) and expose it in Branding Settings so the owner sets `https://document-centre.com` (or whatever their live domain is).

Resolution order inside `_shared/auth-email.ts`:
1. `tenant.app_url` if set
2. `AUTH_EMAIL_APP_URL_FALLBACK` edge-function secret (optional global fallback)
3. The request `origin` header (dev convenience only)

If none resolve, the invite fails with a clear "Set your app URL in Settings → Branding" error rather than silently emailing a lovable.app link.

### 3. Fix the logo

`tenant.logo_url` is a storage path in the private `tenant-branding` bucket, so email clients can't load it. In `_shared/auth-email.ts`:

- If `logo_url` looks like a full `http(s)://` URL, use it as-is.
- Otherwise create a **long-lived signed URL** (e.g. 30 days) against `tenant-branding` and embed that.
- If signing fails, fall back to the text wordmark we already render.

Also add `alt` sizing so Outlook's "picture not downloaded" placeholder looks less broken.

### Files touched

- `supabase/migrations/…` — add `tenants.app_url text`
- `supabase/functions/_shared/auth-email.ts` — resolve app URL, sign logo URL, build custom action link
- `supabase/functions/invite-user/index.ts` and `supabase/functions/request-password-reset/index.ts` — pass through the tenant app URL / build the tenant-hosted link
- `src/pages/AuthAccept.tsx` (new) + route wiring in `src/App.tsx` — verifies `token_hash` then redirects
- `src/features/settings/BrandingSettingsPage.tsx` — add "Public app URL" field

### Out of scope

- Changing Supabase's Site URL / redirect allow-list (owner already has `document-centre.com` added, otherwise the verify call would fail — we'll flag this in the settings help text).
- Touching customer notification emails; those already go through the same helper and will pick up the logo fix automatically.
