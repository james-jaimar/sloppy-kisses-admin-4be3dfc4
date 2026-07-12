## Goal
Every auth email (invite, password reset, magic link, signup confirmation, email change, reauth) leaves as **"Sloppy Kisses" <noreply@…>** using the SMTP config the tenant already saved in Settings → Email Server. No "supabase.io" address, no Supabase default template.

## Why the current setup fails
- Supabase's built-in mailer sends from `noreply@mail.app.supabase.io` with a generic template.
- The recent "H function error" on invite was the front-end reading `Edge Function returned a non-2xx status code` from `invite-user`. The invite itself succeeded (auth log shows `POST /invite → 200`), so a later step in `invite-user` (profile / tenant_users / user_roles insert) is throwing. That's a separate but related bug to fix.

## Terminology (for the future)
When you want this again, say: *"Wire Supabase Auth **Send Email Hook** to our per-tenant SMTP with branded templates."* That's the exact mechanism.

## Plan

### 1. Auth email hook edge function — `supabase/functions/auth-email-hook`
- Public HTTP endpoint (`verify_jwt = false`) that Supabase calls for every auth email.
- Verifies the `Standard-Webhooks` signature using `AUTH_EMAIL_HOOK_SECRET` (added via `generate_secret`).
- Payload gives us `user.email`, `email_data.email_action_type` (`signup` | `recovery` | `invite` | `magiclink` | `email_change` | `reauthentication`), `token_hash`, `redirect_to`, `site_url`.
- Resolve tenant:
  1. Look up `profiles` by email → `tenant_users` → `tenants`.
  2. If none (brand-new invite before profile exists), fall back to the tenant that triggered the invite. We'll pass it through `user.user_metadata.invited_tenant_id` from `invite-user` and read it here.
  3. Final fallback: default tenant flag on `tenants` (already exists).
- Load that tenant's `email_transport_settings` (host/port/user/password/from) via service-role client.
- Render a branded HTML+text template per `email_action_type` (see step 2).
- Build the action URL from Supabase's `token_hash` + `redirect_to` and send via SMTP using `denomailer` (`npm:nodemailer` is not Deno-compatible; `denomailer` is the standard choice for Supabase Edge Functions).
- Log to `email_log` (already exists) so we can audit deliveries.
- Return `{}` 200 to Supabase on success; on failure, log to `email_log` with error and still return 200 (so Supabase doesn't retry-storm) — we surface failures in the UI via the log.

### 2. Branded templates — `supabase/functions/_shared/auth-emails/`
Six React-Email templates (`invite.tsx`, `recovery.tsx`, `signup.tsx`, `magic-link.tsx`, `email-change.tsx`, `reauth.tsx`) rendered with `@react-email/render`. Coral primary, tenant name/logo in header, tenant reply-to. Copy in the tenant's tone ("Welcome to Sloppy Kisses", "Reset your Sloppy Kisses password", etc.).

### 3. Register the hook in Supabase
Add `[auth.hook.send_email]` to `supabase/config.toml`:
```toml
[auth.hook.send_email]
enabled = true
uri = "https://jsmsyezkfxtgmxvgfuxx.supabase.co/functions/v1/auth-email-hook"
secrets = "env(AUTH_EMAIL_HOOK_SECRET)"
```
Because this is user-owned Supabase (not Lovable-managed Cloud), we **also** show a one-time note in chat telling James to toggle the hook on in the Supabase dashboard (Auth → Hooks → Send Email Hook) and paste the same secret. Provide the deep link.

### 4. Fix the `invite-user` "H function error"
- Wrap each of the three post-invite steps (profiles / tenant_users / user_roles) so their real error surfaces to the client instead of a generic non-2xx.
- Pass `invited_tenant_id` and `invited_by_profile_id` into `admin.auth.admin.inviteUserByEmail({ data: {...} })` so the hook can render "James invited you to Sloppy Kisses".
- Front-end (`UsersPage` invite modal): read the error via `FunctionsHttpError.context.text()` and show the actual message in the toast.

### 5. Also route password reset from `/reset-password`
Confirm `resetPasswordForEmail` is called with `redirectTo: ${window.location.origin}/reset-password`. If not, fix. (No new page needed — the app already has one per repo conventions; we'll verify.)

### 6. Settings UX
- On `EmailServerSettingsPage`, add an info panel: *"These SMTP settings are used for **all** Sloppy Kisses emails, including account invites, password resets, and email verifications."*
- Add a "Send test auth email" button that fires an invite-style template to the entered address using the tenant's SMTP, so James can verify branding end-to-end without inviting a real user.

## Out of scope
- Marketing/newsletter emails.
- Rewriting the existing app-email dispatcher for booking notifications (already exists via `notification_events`).
- Switching to Resend/Mailgun — we reuse the SMTP the tenant configured.

## Technical notes
- Secret: `AUTH_EMAIL_HOOK_SECRET` (auto-generated, 64 chars).
- No DB migrations required — reuses `email_transport_settings`, `email_log`, `profiles`, `tenant_users`, `tenants`.
- `denomailer` import: `import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";`
- React-Email in Deno: `import { render } from "npm:@react-email/render@0.0.17";`

## Manual step required from James (one time)
After deploy, open Supabase dashboard → Auth → Hooks → **Send Email Hook** → enable, set URL to the deployed function, paste the secret. I'll give you the exact values and a deep link when we deploy.
