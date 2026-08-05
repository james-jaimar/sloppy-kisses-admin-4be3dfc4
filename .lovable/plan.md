# Fix: customer cannot cancel a hotel booking

## What's happening

Cancelling from the portal fails with:

`column "event_type" is of type notification_event_type but expression is of type text`

The cancel itself is fine — the failure comes from the notification trigger that fires when a booking's status changes.

## Confirmed cause

The `bookings_notify_changes` trigger on `bookings` inserts a row into `notification_events` when the status changes. The event code is chosen with a `CASE` expression:

```text
CASE WHEN NEW.status = 'cancelled' THEN 'booking_cancelled'
     ELSE 'booking_status_changed' END
```

Postgres resolves that `CASE` to `text`, and `notification_events.event_type` is the enum `notification_event_type`, so the insert is rejected and the whole cancel transaction rolls back. The straight (non-CASE) inserts in the same function work because their literals resolve to the enum directly — which is why creating and rescheduling bookings still work and only status changes break.

## Fix

One migration: recreate `public.bookings_notify_changes()` with the CASE result cast to the enum (`::public.notification_event_type`). No other logic changes, no frontend changes.

Also review the sibling `booking_requests_notify_changes` function for the same pattern and cast it too if present.

## Verify

After the migration, cancel BK for the hotel booking from the customer portal and confirm the booking flips to `cancelled` and a `booking_cancelled` row lands in `notification_events`.
