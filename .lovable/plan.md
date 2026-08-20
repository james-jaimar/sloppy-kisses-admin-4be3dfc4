# New quote: make Stay & Play a single tap

## Problem
On the New quote drawer, choosing the **Stay & Play 16:00–16:30** collection window only shows a red hint telling the user to also go and add the "Late Checkout / Stay & Play" line in **Extras & surcharges**. Two steps for one decision, and it is easy to end up with a late collection that is never charged.

## Change
1. Selecting the **Stay & Play 16:00–16:30** collection button automatically adds the Late Checkout / Stay & Play charge (quantity = number of pets on the quote, minimum 1) to the quote lines and the total.
2. Switching back to **09:00–09:30** removes that charge again.
3. The Late Checkout / Stay & Play row is hidden from the **Extras & surcharges** list, so it can only come from the collection button. The red "add the charge below" hint is replaced by a plain confirmation showing the amount that has been added, e.g. "Stay & Play added — R250.00".
4. Extras & surcharges keeps every other surcharge unchanged, and the whole section hides if Stay & Play was the only one configured.
5. Stay & Play stays visible as a named line in the price preview and in the surcharges sent when the quote is created, so the accepted quote's booking and invoice are unaffected.

## Technical notes
- All in `src/features/quotes/NewQuoteDrawer.tsx`; no schema or backend change.
- Identify the surcharge by its `code` (`late_checkout`) from `useHotelSurcharges`; if no such surcharge is configured for the tenant, keep today's behaviour and show a short note that no Stay & Play charge is set up in Settings → Hotel surcharges.
- Sync via an effect on `checkOutWindow` / pet count that writes into the existing `surcharges` quantity map, so line building, totals and the create payload need no other change.
