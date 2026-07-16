# Notifications: dynamic badges + system-wide event map

## Part 1 — Kill the hardcoded sidebar badge

Today `src/constants/navigation.ts` hardcodes `badge: 6` on Booking Requests. Replace with live queries.

**Changes**
- Remove `badge` from the static nav config; keep it as an optional runtime override on the sidebar item type.
- New hook `useNavBadges()` in `src/components/layout/useNavBadges.ts`:
  - `booking_requests.view` → count of `booking_requests` where `status = 'pending'` for current tenant.
  - `bookings.view` (optional) → count of bookings with `cancellation_status = 'requested'`.
  - `comms.view` (optional) → count of `notification_events` with `status = 'failed'` in last 7 days.
  - Uses React Query, 30s stale, gated by permission so we don't query what the user can't see.
- `AppSidebar.tsx` merges the hook result into items by `code` before render.
- Customer sidebar: same pattern later if we want unread invoice / booking update badges (out of scope this pass, noted).

**Acceptance**: badge on Booking Requests reflects real pending count; disappears at 0; updates after approve/reject without a page reload (invalidate on mutation).

## Part 2 — Notification event map

Currently wired event codes: `booking_cancellation_requested`, `customer_signup_pending` (unused now), `invoice_issued`, `invoice_paid`, `invoice_reminder`, `vax_expired`, `portal_invited`, `password_reset_requested`, `manual_message`.

Proposed additions, grouped by audience. Each becomes an `event_code` in `message_templates` + a DB trigger (or edge-function insert) writing `notification_events`. All respect quiet hours and `customers.notify_email`.

### To customer (email, WhatsApp later)
| Event code | Trigger | Purpose |
|---|---|---|
| `booking_requested` | customer submits booking request | "We got your request, we'll confirm shortly" |
| `booking_confirmed` | staff confirms booking / request approved | Confirmation with date, service, resource |
| `booking_rescheduled` | start/end changes on a confirmed booking | New times |
| `booking_cancelled` | booking moves to cancelled | Confirmation, refund/credit note |
| `booking_reminder_24h` | cron, 24h before start | Reminder + prep info |
| `booking_reminder_2h` | cron, 2h before (grooming/mobile) | Pickup/arrival time |
| `check_in_confirmation` | daycare/hotel check-in | "Charlie has arrived" |
| `check_out_confirmation` | check-out | "Charlie has been picked up" + report card |
| `daycare_low_balance` | enrolment day-balance ≤ 2 | Prompt to top up |
| `vax_expiring_30d` / `vax_expiring_7d` | cron on `vaccinations.expires_at` | Renewal nudge (currently only `vax_expired`) |
| `vax_expired` | already exists | Already wired |
| `invoice_issued` | exists | — |
| `invoice_reminder` | exists (cron) | — |
| `invoice_overdue` | day after due | Escalation copy |
| `invoice_paid` | exists | — |
| `credit_note_issued` | credit_notes insert with status issued | Copy of credit note |
| `refund_issued` | payment_refunds row | Confirmation |
| `payment_failed` | PayFast webhook failure | Retry link |
| `document_uploaded` | staff uploads document tagged share_with_customer | "New document available" |
| `portal_invited` / `password_reset_requested` | exist | — |

### To staff / owner (email + in-app badge)
| Event code | Trigger | Route notified |
|---|---|---|
| `booking_request_received` | customer submits request | Ops inbox; drives sidebar badge |
| `booking_cancellation_requested` | exists | Ops inbox |
| `customer_signup` | new customer self-signup | Owner (informational; no review gate) |
| `portal_pet_added` / `portal_pet_updated` | customer edits pet | Ops (may need vet recheck) |
| `vax_expired_internal` | cron | Ops list — block check-ins |
| `smtp_send_failed` | dispatcher failure | Admin (via in-app failure badge, no email loop) |
| `payment_received_large` | payment > configurable threshold | Owner |
| `mobile_van_route_gap` | van workflow anomaly | Van manager (later) |

### System / cron jobs to add
- `send-booking-reminders` (24h, 2h windows)
- `send-vax-reminders` (30d, 7d, 0d)
- `send-invoice-overdue` (already partially covered by `send-invoice-reminders`)
- All extend the existing `send-notifications` dispatcher — no new transport code.

### Settings surface
- Admin → Settings → Message templates already lists event codes. Extend the dropdown in `MessageTemplatesPage.tsx` with the new codes so owners can author copy per channel.
- Add a **Notification rules** admin page later (opt-in per event, per channel, quiet-hour overrides). Out of scope for this ticket; flagged for next pass.

## Deliverables for this build
1. `useNavBadges` hook + `AppSidebar` wiring; remove hardcoded `badge: 6`.
2. Invalidate the `nav-badges` query key from booking-request approve/reject mutations.
3. Document the event catalog above in `mem://features/notifications` so future work has a checklist.

Implementing the new triggers, cron jobs, and template seeds is scoped separately — this plan sets the map; we'll build events in prioritized batches after you confirm which tier matters first.
