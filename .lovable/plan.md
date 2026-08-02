## Confirmed first: nothing was sent to clients

Verified against the database before writing this plan:

- `email_log` (the record of every actual SMTP hand-off) holds 12 rows for the entire life of the project. Every recipient is you, Charlotte, `admin@jaimar.dev`, `hello@document-centre.com`, or `jimmybhawkins@gmail.com`. No client address.
- The 158 `booking_created` / `booking_rescheduled` events from the seed run are all `pending` with `sent_at = NULL`; 76 more are `skipped`.
- `cron.job` contains three jobs only: `send-invoice-reminders-daily`, `queue-booking-reminders-daily`, `documents-purge-nightly`. Nothing invokes the notification dispatcher, so the pending queue had no route out.
- The single reminder-eligible invoice (`INV00097`, due 03 Aug) belongs to a test customer on your own gmail.

The risk is not what happened — it's that 158 queued events point at 97 real customer addresses and one keystroke could dispatch them.

## What to build

### 1. Global outbound send lock (belt)

Add a tenant-level comms safety switch, defaulting to **locked**:

- New columns on `comms_settings`: `sending_enabled boolean not null default false` and `test_recipient_allowlist text[] not null default '{}'`.
- Every server-side send path gains one shared guard helper in `supabase/functions/_shared/`:
  - if `sending_enabled` is false **and** the recipient is not in the allowlist → do not send; write an `email_log` row with status `blocked` and a reason, and return success to the caller so nothing errors out.
  - if the recipient is in the allowlist → send normally, regardless of the switch.
- Wire the guard into every function that can put mail on the wire: `send-notifications`, `send-invoice-email`, `send-invoice-reminders`, `invite-user`, `customer-portal-invite`, `customer-portal-reset`, `request-password-reset`, `notify-test-send`, `send-test-email`.
- The guard is the *last* thing before the SMTP call, so no future code path can slip past it.

### 2. Pause the schedulers (braces)

- Deactivate `send-invoice-reminders-daily` and `queue-booking-reminders-daily` (leave the rows in place so they can be switched back on at go-live). `documents-purge-nightly` sends no mail and stays active.

### 3. Neutralise the seeded queue

- Set the 158 `pending` notification events created during seeding to `blocked`, with a note recording why. They stay visible in the Comms inbox for audit but no dispatcher will ever pick them up.
- Pause reminders on `INV00097` so tomorrow morning's job has nothing at all to act on even before the lock takes effect.

### 4. Make the state impossible to miss

- A **Comms safety** card at the top of Settings → Email: a large red/green status banner reading "Outbound email is LOCKED — only allowlisted addresses receive mail" or "LIVE — all customers receive mail", the allowlist editor, and a confirm dialog on unlocking that states how many customers become reachable.
- A persistent amber strip in the admin header while the lock is on, so nobody forgets.
- Gate the toggle behind an admin-only permission code.

## Technical notes

- Migration: two columns on `comms_settings` with safe defaults; no data loss. Cron deactivation and the queue update run as data statements, not schema migrations.
- Defaulting `sending_enabled` to `false` means the lock is on the instant it deploys — no window where it's live-but-unconfigured.
- Blocked sends are logged rather than silently dropped, so testing still shows you exactly what *would* have gone out and to whom.
- Go-live is then a deliberate two-step: clear the seed data, then flip the switch.
