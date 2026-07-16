# Invite link "expired" — fix

## Diagnosis (from Supabase auth logs)

From Charlotte's IP `41.122.153.15`:

- `16:47:22` — first `/verify` call returned **200**, `user_signedup` + login. Token consumed successfully.
- `16:50:00` — second `/verify` call returned **403 `otp_expired`** ("One-time token not found").

Invite tokens in Supabase are single-use. Her first click worked — she was signed in — but the destination page (`/reset-password`) evidently didn't pick up the fresh session and bounced her back to `/login`, so it *looked* to her like the link had failed. She then clicked the email a second time (2m38s later), which legitimately returned expired because the token was already consumed. Our `AuthAccept` screen renders that as a hard "Link problem / expired" error, reinforcing the impression that the whole invite is broken — when in fact her account is fine.

## Fix

Three changes, all UX/glue — no schema changes.

### 1. `AuthAccept.tsx` — treat "already used" as success

Before calling `verifyOtp`, check `supabase.auth.getSession()`. If a session already exists for the target `next` route, skip verify and navigate straight there.

After `verifyOtp`, if it returns an `otp_expired` / `token_not_found` error **but** a session now exists (or has existed all along), treat it as success and navigate to `next` instead of showing the error screen. Only show "Link problem" when there's genuinely no session and the token failed.

Also: guard the effect against double-invocation (StrictMode) with a ref so we don't hit `/verify` twice from a single mount.

### 2. `ResetPassword` page — don't bounce authenticated invitees

Audit `src/pages/ResetPassword.tsx` (currently not in our context — read first):

- It must recognise the session established by `verifyOtp` for `type=invite` and `type=recovery` and render the "set your password" form immediately, without redirecting to `/login`.
- On successful `updateUser({ password })`, route based on `profile.user_type` (staff → `/admin/dashboard`, customer → `/customer/dashboard`, platform → `/platform`) so invitees land somewhere useful instead of the login screen.
- If a signed-in user with a password already lands here (re-click after they've already set it), redirect them to their dashboard rather than showing the set-password form.

### 3. Invite email copy — set expectations

Small copy tweak in `_shared/auth-email.ts` invite template: add a line "This link can only be used once — if it stops working, ask your admin to resend it." This alone would have stopped Charlotte re-clicking the email.

## Files to change

- `src/pages/AuthAccept.tsx` — session-aware verify, StrictMode guard, don't fail when already signed in.
- `src/pages/ResetPassword.tsx` — render set-password form for invite/recovery sessions; user-type-aware post-save redirect; redirect away if password already set.
- `supabase/functions/_shared/auth-email.ts` — one-sentence copy addition in the `invite` template body.

## What this does NOT change

- The single-use nature of Supabase invite tokens (that's correct behaviour).
- The `invite-user` edge function — the send path is working; the log confirms both `admin/generate_link` and the tenant SMTP delivery succeeded.
- Any DB / RLS / roles logic.

## Verification

After the fix:

1. Resend Charlotte's invite (she's already active, so use "resend" mode which mints a fresh token). Click once — should land on set-password form, not login. Set password → dashboard.
2. Click the same email link a second time — should silently land on the dashboard (already signed in), not the "expired" screen.
3. Send a brand-new invite to a test address, click once, set password, close tab, click email link again — should route to dashboard.
