# What's actually going on

Three separate issues are compounding into "nothing works and Comms looks weird":

## 1. Comms ≠ auth emails (this is the biggest confusion)
The **Comms** page you're looking at (`/admin/comms`) reads from the `notification_events` table. That table only receives **customer-facing app messages** — booking confirmations, reminders, invoice notices, etc. It has never received, and by design does not receive, Supabase **auth emails** (invites, password resets, magic links). So your invite to `hello@document-centre.com` was never going to show up there. That's not a bug, it's just two different pipelines.

The rows you see stuck as `pending` / `skipped` in Comms are old booking-reschedule events that were never dispatched because `send-notifications` needs a `RESEND_API_KEY` and message templates set up — separate problem, addressed below.

## 2. The `auth-email-hook` was built but never wired up in Supabase
Edge function logs confirm `auth-email-hook` has **zero invocations** — Supabase has never called it. That means the "Send Email Hook" in **Supabase → Authentication → Hooks** is still disabled (or pointing elsewhere). Result: your invite email either went out via Supabase's default template from `noreply@mail.app.supabase.io`, or wasn't sent at all if no auth SMTP is configured on that side. Either way, it never touched your branded template and never used your tenant SMTP (`mail.jaimar.dev`).

I cannot enable that hook for you — it's a manual toggle in the Supabase dashboard. I'll give you the exact URL and settings.

## 3. `auth-email-hook` has a bug that would break logging once enabled
The hook inserts into `email_log` with a `template` column, but that table's column is actually `template_code`. So even after you enable the hook, every send would fail to log (silently — it's in a try/catch). Same insert also passes `tenant_id: null` in the failure branch, which likely violates NOT NULL.

# Plan

## A. Fix the `auth-email-hook` code
- Change the `logEmail` insert to use the real `email_log` columns: `template_code` (not `template`), keep `to_email`, `subject`, `status`, `error_message`, `sent_at`.
- Skip the insert entirely when `tenant_id` is null (avoid NOT NULL crashes); log to console only in that case.

## B. Make auth emails visible in the app
Right now auth sends are logged to `email_log`, which has no UI. Add a small **"Auth emails"** panel on the Comms page (or a tab) that reads `email_log` rows for the current tenant so you can see invites/resets/magic links, their status, and any error — the same view you expected in Comms.

## C. Give you clear instructions to enable the hook
Once A is deployed, you need to do this one-time step in Supabase:
1. Open **Auth → Hooks → Send Email Hook**
2. Enable it
3. URL: `https://jsmsyezkfxtgmxvgfuxx.supabase.co/functions/v1/auth-email-hook`
4. Secret: the `AUTH_EMAIL_HOOK_SECRET` value you already saved
5. Save, then re-invite `hello@document-centre.com` as a test.

I'll surface a button in the reply so you can jump straight there.

## D. (Optional, ask before doing) Fix the Comms pipeline itself
The old booking-reschedule events sit as `pending` because `send-notifications` needs (a) a provider and (b) message templates. Two options — I won't do this unless you confirm:
- **Option 1:** Route `send-notifications` through your tenant SMTP (same `email_transport_settings` the auth hook uses) instead of Resend. Cleanest — one email pipeline for everything.
- **Option 2:** Keep Resend, and I'll walk you through adding the API key + a couple of default templates.

# What I will NOT touch
- The Supabase dashboard hook toggle (you have to click it).
- The `notification_events` rows that are currently `skipped` — those are historical, cancelled by an operator.
- The invite-user function itself — it's working (returned 200, created the user).

# Technical notes
- `email_log` real columns: `id, tenant_id, customer_id, booking_id, booking_request_id, estimate_id, invoice_id, template_code, to_email, cc_email, subject, status, provider_message_id, error_message, sent_at, created_by, created_at`.
- Tenant SMTP is configured: `mail.jaimar.dev:465` SSL, from `Sloppy Kisses <hello@jaimar.dev>`. The hook will use this correctly once wired.
- `config.toml` already has `[functions.auth-email-hook] verify_jwt = false` — correct for a Supabase webhook.
