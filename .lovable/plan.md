# Sprint 7 — Comms polish

Turn the dispatcher (already sending SMTP + logging) into a proper comms layer with real customer-ready templates, live previews, tenant editing, and the missing scheduled events.

## What's in place today (verified)
- `send-notifications` dispatcher renders `{{path.to.value}}` templates and sends via tenant SMTP; logs to `email_log`.
- `message_templates` table + `MessageTemplatesPage` CRUD (event, channel, subject, body, active, auto_send).
- `notification_events` triggers already fire for: booking_created (Sprint 5), booking_request_created, booking_request_status_changed, invoice_issued, invoice_paid.
- Comms inbox + booking-scoped comms panel exist.
- Quiet hours + comms_settings live in `CommsSettingsPage`.

## Gaps this sprint closes
1. No polished default templates — tenants start with an empty list.
2. No preview: admins can't see the rendered subject/body before saving.
3. No T-24h booking reminder, no overdue invoice nudge scheduler (only the daily invoice-reminder cron for issued invoices exists).
4. Template body has no rich-context reference (variables are guessed).
5. No test-send button per template (only the global test recipient).
6. HTML email rendering is plain-text only; needs branded HTML wrapper (logo + brand color + footer) reused from auth emails.

## Deliverables

### 1. Seeded default templates (migration)
Insert `is_active=true, auto_send=true` rows per tenant for the five customer-facing events, email channel:
- `booking_created` — "Booking confirmed" (dates, service, pet, price)
- `booking_reminder_24h` — new event code, "See you tomorrow"
- `booking_cancelled` — "Booking cancelled"
- `invoice_issued` — "Your invoice from {{tenant.name}}" with link
- `invoice_reminder` — overdue nudge (existing but seeded)
- `invoice_paid` — "Payment received, thank you"

Seeded only if the tenant has zero templates for that `(event_code, channel)`; safe to re-run.

### 2. Branded HTML wrapper
Extract `renderBrandedHtml(tenant, bodyText)` from `_shared/auth-email.ts` and use it in `send-notifications` so notification emails match the invite/reset look (logo from `tenants.logo_url`, coral accent, footer with tenant name + reply-to). Plain-text stays for the `content` field; HTML goes in `html`.

### 3. Template preview + test-send in the editor
`MessageTemplatesPage` right panel adds:
- **Preview tab** next to the body editor. Renders subject + HTML body using a sample context object (fake customer/pet/booking/invoice) so brand + variables are visible while typing.
- **Variables reference** collapsible listing available `{{...}}` paths per event code (driven by a static map in `src/features/comms/templateVariables.ts`).
- **Send test** button — POSTs to a new `notify-test-send` edge function that renders with the sample context and mails the tenant's `comms_settings.test_recipient`. Logged to `email_log` with `template_code='test.<event_code>'`.

### 4. T-24h booking reminder
- New event code `booking_reminder_24h` added to enum + `EVENT_CODES` list.
- New edge function `queue-booking-reminders` (cron daily 09:00 SAST): finds `bookings` where `start_at` is between now+23h and now+25h, `status in ('confirmed','pending')`, and no existing `notification_events` row of that type for that booking. Inserts one pending event; existing dispatcher handles the send.
- pg_cron schedule inserted via `supabase--insert` (user-specific URL/key, per schedule-jobs rule).

### 5. Overdue nudge visibility
The daily `send-invoice-reminders` already sends via SMTP directly, bypassing `notification_events`. Wrap it so each reminder also inserts a `notification_events` row (`event_code='invoice_reminder'`, status='sent', body_rendered filled) so the Comms inbox shows one timeline per customer instead of two silos.

### 6. Per-tenant fallback subject
If a template has no subject, dispatcher falls back to `"{event_code} — {tenant.name}"` instead of `"(no subject)"`.

## Out of scope
- WhatsApp/SMS transports (channels remain stubbed; templates can be authored but won't send).
- Rich WYSIWYG editor (Markdown/HTML by hand for now).
- Per-customer language variants.
- Auth email template editor (auth emails stay code-defined).

## Technical notes
- One migration: add `booking_reminder_24h` to notification event enum + seed templates via `INSERT … SELECT tenant_id … WHERE NOT EXISTS`. No new tables → no GRANT/RLS work.
- Two new edge functions: `notify-test-send`, `queue-booking-reminders`. Both use tenant SMTP via existing `loadTransport` helper (extract to `_shared/comms-transport.ts`).
- `templateVariables.ts` is a plain map `event_code → { path, label, sampleValue }[]` used by both the reference panel and the preview sample context.
- No new settings screen — everything hangs off existing Message Templates + Comms settings pages per the settings-first rule.

Say **"go"** to build, or tell me which item to drop / re-order.
