# Department logins: daycare, in-house grooming, hotel, mobile grooming, front desk

## What exists today

Roles already in the database: Daycare Staff, Grooming Staff, Hotel Staff, Driver, Front Desk, Accounts, Read Only, Tenant Admin/Owner. Work mode (`/work`) shows tabs by permission: `work.daycare`, `work.hotel`, `work.transport`, `work.grooming`. Grooming Staff currently has one permission covering both in-house and mobile, and the van route screen sits behind the driver's transport permission. Every staff login lands on the same launcher.

## 1. Split mobile grooming from in-house

- New permission `work.grooming_mobile`; the existing `work.grooming` becomes in-house only.
- New role **Mobile Groomer**: today's van jobs, the route list, job start/stop, photos, sign-off, incidents, and read-only customer/pet detail for the stop. No in-house board, no admin screens.
- **Grooming Staff** (in-house) keeps the in-house board and loses van access.
- Van route screen (`/work/vans`) becomes visible to either the driver or the mobile groomer permission.
- Both roles remain assignable per user, so a person who does both can hold both.

## 2. Role-based landing after login

Landing is decided from permissions, most specific first:

```text
front desk / admin / owner   -> /admin/home
mobile groomer (only)        -> /work/vans   (today's route)
daycare staff (only)         -> /work/daycare
hotel staff (only)           -> /work/hotel
in-house groomer (only)      -> /work         (My day, grooming jobs)
driver (only)                -> /work/vans
more than one department     -> /work         (My day launcher)
```

The same rule applies to the app root, to `/work` when a user has a single department, and to the "Open full admin app" button (hidden for staff with no admin screens).

## 3. Device-appropriate formatting (layout only, nothing blocked)

- **Mobile groomer — phone first.** Route and job screens tuned for one-hand use: full-width tap targets, sticky action bar, collapsed detail sections, larger status buttons, address/phone as tap-to-navigate and tap-to-call. Scales up cleanly on a tablet.
- **Daycare and hotel — phone and tablet.** Single-column card list on a phone; two-column board with a persistent day/round header from tablet width up. Round and check-in buttons stay thumb-sized on both.
- **In-house grooming — phone and tablet.** Same treatment: stacked job cards on a phone, lane/board view on a tablet.
- **Front desk — tablet and laptop.** Admin screens get a tablet pass: wider tap targets on the Home launcher and quick actions, tables that switch to card rows below tablet width, modals and drawers that fill the screen on small viewports. On a phone the admin area still loads, with a one-line hint that the counter tools are built for a tablet or laptop.

## 4. Settings and admin

- The new role and permission appear in Users & roles like the others, so the owner can assign, rename and re-scope them without a developer.
- Any existing user on Grooming Staff who does mobile work will need Mobile Groomer added — the plan flags them in the users list rather than guessing.

## Technical notes

- Migration: insert the `work.grooming_mobile` permission, insert the `staff_groomer_mobile` role, grant its permission set, and remove van/transport grants from `staff_grooming`. No table changes.
- Frontend: extend `useWorkDepts` with a `grooming_mobile` department, add a `landingFor(permissions)` helper used by `Login.tsx`, `Index.tsx` and `WorkLayout`, and adjust the `/work` tab list. Responsive work happens inside the work pages, `AdminLayout`, `AppHeader`, `HomePage`/`HomeQuickActions` and the shared table/modal components.
- Verification pass afterwards: sign in as each of the five roles at phone, tablet and laptop widths and confirm the landing screen, visible tabs and layout are right.
