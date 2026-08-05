# Fix: "operator does not exist: integer = text" when a customer creates a hotel booking

## Cause (confirmed)

`sync_hotel_daycare_credits()` — the function that works out daycare credits for a hotel stay — counts the stay's nights with:

```text
EXTRACT(ISODOW FROM d)::int = ANY(r.selected_days)
```

But `daycare_enrolments.selected_days` is a text array of day names (actual values in the database: mon, tue, wed, thu, fri), not day numbers. Postgres therefore aborts with `operator does not exist: integer = text`.

It only fires when a pet on the hotel booking also has an active daycare enrolment, which is why some bookings go through and this one did not. The failure happens inside the trigger chain that runs when the hotel booking details row is inserted, so the whole booking creation rolls back.

## The fix

One migration that replaces the day match in `sync_hotel_daycare_credits()` with the same convention already used by `daycare_day_availability` and `daycare_prorata_quote`:

```text
lower(to_char(d, 'Dy')) = ANY (r.selected_days)
```

keeping the existing "no selected days = every day counts" fallback. Nothing else in the function changes.

## Verification

- Re-run the credit calculation for an existing hotel booking whose pet has a daycare enrolment and confirm it returns instead of erroring.
- Create a hotel booking from the customer portal end to end and confirm it saves, invoices, and shows the daycare credit.