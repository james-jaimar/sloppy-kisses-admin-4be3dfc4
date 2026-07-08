## Phase 8 — Communications & Vaccination Gate

Phases 1–7 shipped the operational scaffolding (bookings across all services, daycare enrolments, invoices & payments). The next roadmap item is turning the `notification_events` queue into actual outbound comms, plus enforcing vaccination requirements before pets can attend daycare, hotel, or grooming. Both are "settings-first": the operator configures templates and rules; the system reacts.

### What we'll build

1. **Comms Inbox at `/admin/comms`**
   - Tabbed view: **Outbox** (queued/sending), **Sent**, **Failed**, **All**.
   - Row: channel icon (email / whatsapp / sms), recipient, subject/preview, related booking/invoice link, status chip, timestamp.
   - Filters: channel, status, template, date range, customer.
   - Row click → drawer with full rendered body, delivery log, "Resend" and "Cancel" actions.
   - Top stat cards: Queued, Sent today, Failed (7d), Bounces.

2. **Message Templates at `/admin/settings/message-templates`**
   - CRUD list of templates keyed by `event_code` (e.g. `booking.confirmed`, `booking.reminder_24h`, `invoice.issued`, `invoice.reminder`, `daycare.enrolment.low_credits`, `vax.expiring_30d`, `vax.expired`).
   - Per template: channel (email / whatsapp / sms), subject (email only), body with mustache-style tokens (`{{customer.first_name}}`, `{{booking.start_at}}`, `{{invoice.number}}`, `{{invoice.balance}}`, `{{pet.name}}`), active toggle, "send to" (customer / internal / both).
   - Live preview panel that renders against a sample payload.
   - Seeded with sensible defaults for every event code the DB already emits.

3. **Comms Settings at `/admin/settings/comms`**
   - Sender identity: from-name, from-email (verified via existing Resend domain), reply-to, WhatsApp sender number (stub — provider TBD), SMS sender ID (stub).
   - Global quiet hours (no automated sends outside window) + timezone (Africa/Johannesburg default).
   - Per-event toggles: which templates fire automatically vs. manual-only.
   - Test send: pick a template + a customer → sends a real message to the operator's own address to sanity-check rendering.

4. **Dispatcher edge function `send-notifications`**
   - Cron-triggered (every 1 min) + on-demand invoke.
   - Picks pending `notification_events` rows, resolves template by `event_code`, renders body with the row's payload + related record lookups, sends via provider (Resend for email — already wired for auth; WhatsApp/SMS providers stubbed with pluggable interface), writes result back to the event row (`status`, `sent_at`, `error`, `provider_message_id`).
   - Respects `customers.notify_email` / `notify_whatsapp` / `notify_sms` flags and quiet hours.
   - Idempotent: `status = 'pending'` → claim with `for update skip locked`.

5. **Vaccination gate**
   - **Vaccination records**: extend existing `pet_vaccinations` (or create if missing) with `vaccine_type`, `administered_on`, `expires_on`, `certificate_url` (upload to Supabase storage), `verified_by`, `verified_at`.
   - **Requirements settings at `/admin/settings/vaccination-rules`**: per service (daycare / hotel / grooming), list required vaccine types (rabies, 5-in-1, kennel cough, snuffles for cats, etc.) with grace-period days.
   - **Enforcement**:
     - Booking create/edit shows a red banner + list of missing/expired vaccines for the pet; operator with `bookings.override_vax` permission can proceed with a required override reason (logged).
     - Daycare board & attendance flag pets with expired vaccines with a warning chip.
     - Nightly cron writes `notification_events` for `vax.expiring_30d`, `vax.expiring_7d`, `vax.expired` (deduped per pet per window).
   - **Pet detail** gets a "Vaccinations" tab: table, add/edit dialog, upload certificate, status chips (valid / expiring soon / expired).

6. **Wiring across existing screens**
   - Booking detail: "Comms" panel listing all `notification_events` for the booking + "Send message" (pick template).
   - Invoice detail: "Send reminder" now goes through the dispatcher path.
   - Customer detail: "Comms" tab (existing events + manual send).

### Out of scope (deferred)

- WhatsApp Business API + SMS provider integration — provider stubs only this phase; real integration in 8b once the operator picks a vendor (likely Twilio or MessageBird).
- Two-way inbound replies / conversation threading — Phase 8c.
- Customer portal self-service vaccination upload — Phase 9 (portal).
- Marketing broadcasts / segments — later.

### Files (planned)

- `src/features/comms/CommsInboxPage.tsx`, `CommsEventDrawer.tsx`, `SendMessageDialog.tsx`, `queries.ts`, `status.tsx`
- `src/features/settings/MessageTemplatesPage.tsx`, `MessageTemplateEditor.tsx`, `CommsSettingsPage.tsx`, `VaccinationRulesPage.tsx`
- `src/features/pets/PetVaccinationsPanel.tsx`, `VaccinationDialog.tsx`
- `src/features/bookings/BookingCommsPanel.tsx`, `BookingVaxWarning.tsx`
- `supabase/functions/send-notifications/index.ts` (dispatcher) + pg_cron schedule
- Migration:
  - `message_templates` (tenant, event_code, channel, subject, body, active, send_to)
  - `comms_settings` (tenant, from_name, from_email, reply_to, whatsapp_from, sms_from, quiet_start, quiet_end, timezone, per_event_auto jsonb)
  - `vaccination_rules` (tenant, service_type, vaccine_type, grace_days, required)
  - Extend `pet_vaccinations` if needed; add `certificate_path`, `verified_by`, `verified_at`
  - Add `override_reason` + `override_by` to `bookings` (nullable) for vax override audit
  - New permissions: `comms.view`, `comms.send`, `settings.comms.manage`, `settings.vaccination.manage`, `bookings.override_vax`, `pets.manage_vaccinations`
  - All tables get GRANTs + RLS + `updated_at` triggers per project rules
- Route wiring in `src/App.tsx`, Settings index, sidebar entry for **Comms** under Operations

### Verification

- Issue an invoice → row appears in Comms Outbox → dispatcher runs → status flips to `sent` → email arrives via Resend.
- Edit `invoice.issued` template → next issue uses new copy; preview matches actual send.
- Create a daycare booking for a pet with expired rabies → red banner blocks confirm; user with `bookings.override_vax` can proceed with reason, which appears on booking detail.
- Nightly cron writes `vax.expiring_30d` events for pets in window; not duplicated on re-run.
- Toggle `customers.notify_email` off → dispatcher skips that recipient and marks event `skipped`.
- Non-admin without `settings.comms.manage` cannot open template / comms settings pages.

Shall I proceed with Phase 8 as above?
