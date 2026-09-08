# Turn off driver access to customer phone numbers

## What I found

The switch already exists. In Settings → Policies there is a "Customer privacy" section with
"Hide customer phone numbers from staff". I checked the live setting for Sloppy Kisses: it is
currently **off**, which is why the call button still shows on the driver's phone.

When it is on, the call button disappears everywhere in Work Mode (route list and job screen)
and phone numbers are removed from the printed daily lists. Only roles that hold the
"See customer phone numbers" permission keep access — today that is the owner, admins,
front desk and accounts. Mobile groomers, drivers and other work-mode staff do not have it.
Note: if you test while logged in as the owner or an admin, you will still see the call button —
that is expected. Test with a driver login.

## What I will do

1. Switch the setting on for Sloppy Kisses so drivers immediately lose the call button.
2. Make the privacy switch harder to miss: move it to the top of the Policies page and add a
   plain-language line saying who still keeps access, so you can flip it yourself in future.
3. Stop the number from even reaching the driver's device. Today the number is loaded and
   hidden in the screen; I will stop loading it for staff who are not allowed to see it, so it
   cannot be read by other means.
4. Show a small "Number hidden" note in place of the call button, so drivers understand it is a
   policy rather than missing data, and know to ask the front desk.

## Technical notes

- `policy_settings.hide_customer_phone_from_staff` set to true (data update, not schema).
- `useCustomerContactVisibility` already gates `VansWorkPage.tsx`, `JobPage.tsx` and
  `DailyListsPage.tsx`; extend the gate into `src/features/work/queries.ts` so `customers.mobile`
  is only selected when the viewer holds `customers.contact.view`.
- Reorder the "Customer privacy" section in `PolicySettingsPage.tsx`; copy tweak only.
- No new tables, permissions or migrations needed.
