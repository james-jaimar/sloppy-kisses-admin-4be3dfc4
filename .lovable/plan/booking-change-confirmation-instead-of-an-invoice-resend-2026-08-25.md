# Booking change confirmation instead of an invoice resend

## What happened (verified)

- At 15:20 today an `invoice_send` email for INV00098 went out to you. That comes from the booking save path: after details are saved, the app re-emails the booking's invoice whenever it is still in `issued` state — regardless of whether the amount changed.
- The system already records a `booking_rescheduled` notification event with the old and new times, and there is already an active `booking_rescheduled` email template. But those events are sitting at `pending`: nothing runs the dispatcher — there is no scheduled job for `send-notifications`, and no code invokes it.

So today a move produces the wrong email (invoice resend) and never produces the right one (booking change confirmation).

## What to change

1. **Stop the reflex invoice resend.** On a booking save, capture the invoice number/total before the save and compare after. Only email the invoice when the total actually changed (or the invoice is brand new). A time-only move sends no invoice email.

2. **Send a proper booking change confirmation.** Use the existing `booking_rescheduled` event and rewrite the default template so it reads like a confirmation:
   - "Your booking BK-1042 for Charlie has moved."
   - Previously: Tue 25 Aug 2026, 12:00
   - Now: Fri 28 Aug 2026, 14:00
   - A closing line that says either "Your invoice total is unchanged" or "Your invoice has been updated to R X" depending on what happened.

3. **Give the template real tokens.** The dispatcher will expose formatted change tokens built from the event payload — `{{change.previous_start}}`, `{{change.new_start}}`, `{{change.previous_end}}`, `{{change.new_end}}`, `{{change.invoice_line}}` — in South African format (dd MMM yyyy, HH:mm). These get added to the Settings → Message templates variable list so the owner can edit the wording herself.

4. **Actually deliver it.** Add a scheduled job that drains pending notifications every few minutes, and fire the dispatcher immediately after a reschedule so the customer gets the mail right away instead of waiting for the next tick. Quiet hours still defer sends as they do now.

5. **Cover every move path**, not just the grooming board: booking edit form, grooming board drag/drop and groomer picker, and the customer portal move modal all go through the same `bookings` update, so the trigger already catches them — the portal modal's success toast will stop implying an invoice change when the total is unchanged.

## Technical notes

- `src/features/bookings/detailsQueries.ts`: `useUpsertBookingDetails` currently calls `autoEmailBookingInvoice` unconditionally. Change to a total-diff check (read `invoices.id,total,status` before and after).
- `src/features/invoices/autoEmail.ts`: add an option so the caller can require a total change.
- `supabase/functions/send-notifications/index.ts`: add a `change` context block derived from `ev.payload` (`from_start`, `to_start`, `from_end`, `to_end`) with ZAR-locale formatting; keep raw `payload` tokens working.
- `src/features/comms/templateVariables.ts`: add the `change.*` variables under `booking_rescheduled` with samples.
- Migration: update the default `booking_rescheduled` email template body/subject; add a `cron.schedule` entry invoking `send-notifications` every 5 minutes (the two currently pending events will then flush).
- `src/features/grooming/queries.ts` (`useRescheduleGrooming`) and the portal move modal: invoke `send-notifications` after a successful move for immediate delivery.
