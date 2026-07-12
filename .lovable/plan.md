# Rip out the Send Email Hook — send auth emails ourselves via SMTP

## Why

You're right — this got over-engineered. The current setup asks Supabase Auth to POST a signed webhook to `auth-email-hook`, which then renders + sends via SMTP. That's why you're seeing:

- `500: Hook requires authorization token` on `/invite`
- `signature verification failed: Base64Coder: incorrect characters for decoding` in the hook logs

Supabase's Send Email Hook is a niche feature. Standard practice (and what you already do elsewhere) is: the app owns the email. Call an edge function, generate the action link, send SMTP, log it. No webhook, no signing secret, no hook toggle in the Supabase dashboard.

## What changes

### 1. `invite-user` edge function — send the invite ourselves
- Stop calling `admin.auth.admin.inviteUserByEmail(...)` (that's what triggers Supabase → hook).
- Instead:
  1. `admin.auth.admin.createUser({ email, email_confirm: false, user_metadata: {...} })` if new, else reuse existing auth user.
  2. `admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } })` → returns `action_link` without sending anything.
  3. Load tenant SMTP from `email_transport_settings`, render the branded invite HTML, send via `denomailer`.
  4. Insert into `email_log` with `template_code = 'auth.invite'`, status `sent`/`failed`.
- `mode: "resend"` does the same thing minus profile/tenant_users work: fresh `generateLink` + SMTP send.

### 2. New `send-auth-email` edge function (shared helper)
Small internal function called by `invite-user` (and later by password reset / magic link flows) that takes `{ tenant_id, recipient, action: 'invite'|'recovery'|'magiclink', action_url, context }`, loads SMTP, renders, sends, logs. Keeps template code in one place.

### 3. Password reset & magic link (frontend)
- New `request-password-reset` edge function: takes `{ email }`, resolves tenant, calls `generateLink({ type: 'recovery' })`, sends via `send-auth-email`.
- Frontend "Forgot password" calls this instead of `supabase.auth.resetPasswordForEmail` (which would go through Supabase's own mailer / hook).
- Magic link: same pattern if/when we enable it. Not urgent — flag only.

### 4. Retire `auth-email-hook`
- Delete `supabase/functions/auth-email-hook/`.
- Tell you to **turn OFF** the Send Email Hook in Supabase dashboard (Auth → Hooks). No secret needed anymore.
- Delete the `AUTH_EMAIL_HOOK_SECRET` project secret.

### 5. Comms → "Email log" tab
No change needed. It already reads `email_log` filtered by `template_code` prefix (`auth.*` / `notify.*`). Once invites go through the new path, they'll show up there with the real subject, recipient, status, and error text.

## What you'll need to do after I ship this

1. Supabase dashboard → **Auth → Hooks → Send Email Hook → disable**.
2. That's it. No secrets to manage, no template config in Supabase.

## Out of scope

- Supabase's own signup confirmation emails: only relevant if you enable email/password self-signup. Right now users only arrive via invite, so this doesn't matter. If you turn on public signup later, we add a `confirm-signup` flow the same way.
- Email change confirmations: rare, same pattern when needed.

## Technical notes

- `generateLink` returns `properties.action_link` — that's the URL we drop into the button.
- Redirect target: existing `${SITE_URL}/auth/callback` (or `/accept-invite` if you have one — I'll check `src/features/auth/` before wiring).
- Existing `email_log` schema and `useAuthEmailLog` query stay as-is.
- `send-notifications` (customer notifications) already uses this exact SMTP pattern — we're just aligning auth onto the same rails.
