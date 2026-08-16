# Repair Mobile Groomer Work Mode end to end

## Confirmed diagnosis

- **Mobile Driver 1 is configured correctly**: the active staff profile has the `staff_groomer_mobile` role, `work.grooming_mobile` permission, and is assigned to **Mobile Van 1**. The affected booking exists, is a `grooming_mobile` booking, and is also assigned to Mobile Van 1. This is not a role or van-assignment problem.
- **My day is being redirected by layout code**: whenever a single-department mobile groomer visits `/work`, `WorkLayout` immediately applies the login landing rule and replaces the route with `/work/vans`. Because React re-renders after the My day date changes, the same redirect runs again, making the arrows appear to throw the user back to Route.
- **The job-detail request is currently invalid**: `useWorkJob` asks `customer_addresses` for `lat` and `lng`, but the real columns are `latitude` and `longitude`. Reproducing the exact frontend query returns Postgres error `42703: column customer_addresses_1.lat does not exist`. `JobPage` then presents every query failure as “Job not found,” hiding the real error.
- The booking-detail expansion that introduced the address fields came from the latest Work Mode change. The existing tenant and grooming RLS policies already allow this active staff user to read the required booking, customer, pet, grooming, health, and instruction records.
- The sampled imported mobile-grooming bookings do not currently contain booking-specific grooming-instruction rows or pet grooming-default rows. The repaired screen must therefore distinguish “no preferences captured” from a failed data request and continue showing the package, pet/customer, warnings, and all other available booking data.

## Changes

1. **Make My day a real selectable tab**
   - Keep the role-based landing redirect only for initial sign-in/home routing.
   - Remove the render-time redirect from `/work`, so tapping **My day** stays on My day and its previous/next-day controls update the list in place.
   - Preserve **Route** as the default landing page for a mobile-only groomer and as a separate tab with its own selected date.

2. **Repair the mobile grooming job query**
   - Query the real `latitude` / `longitude` address fields and map them consistently in the Work Job address model.
   - Keep the detail request tenant-scoped and continue loading customer, pets, van, package, add-ons, notes, address, and grooming timing data.
   - Surface an actual load-error state with a retry action; reserve “Job not found” for a successful query that returns no booking.

3. **Make the appointment usable even when legacy data is incomplete**
   - Render all available booking data independently so one optional section cannot blank the entire job.
   - Show vaccination/health warnings, customer and tap-to-call details, pet breed/size/medical and behaviour information, van/date/time, mobile address/maps, package/add-ons, notes, checklist, photos, workflow actions, incidents, and sign-off.
   - Show the grooming brief from booking instructions, then pet defaults; if neither exists, clearly state that preferences were not captured and the groomer must contact the office rather than implying the appointment failed to load.
   - Do not invent or migrate grooming preferences for imported bookings.

4. **Regression checks**
   - Add routing coverage proving a single-department mobile groomer can switch between My day and Route and change dates on both without forced navigation.
   - Add query/model coverage for `latitude` / `longitude`, optional/null address data, and clear error-vs-not-found states.
   - Verify Mobile Driver 1 sees only Mobile Van 1 mobile-grooming jobs (plus the existing intentional unassigned-job behaviour), can open a listed job, and sees the complete available brief on phone/tablet widths.

## Technical scope

Frontend Work Mode routing, query mapping, detail rendering, and tests. No role, permission, RLS, resource assignment, or booking-data migration is required for this repair.