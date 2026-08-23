# Fix: "That accommodation isn't available for these pets" when saving a portal quote

## What's wrong

The portal quote function reads the hotel rate cards using a column name that doesn't exist. The rate card table has a column called `active`, but the function asks for `is_active`. That request fails, so the function sees zero rate cards and reports that the accommodation isn't available — even though all four rate cards (Cattery, Puppy & Small Breeds Area, Hotel, Cabanas) are active and priced.

Confirmed by reading the table's columns and its rows.

## The fix

- In `supabase/functions/portal-create-quote/index.ts`, change the rate-card query to select and filter on `active` instead of `is_active`.
- Return a clearer message if a rate card genuinely can't be matched (name the accommodation), so a future mismatch is diagnosable instead of generic.
- Re-test by saving a hotel quote from the portal for the same dates/pets in the screenshot and confirming a quote row is created and the hold is set.

No database or UI changes needed.
