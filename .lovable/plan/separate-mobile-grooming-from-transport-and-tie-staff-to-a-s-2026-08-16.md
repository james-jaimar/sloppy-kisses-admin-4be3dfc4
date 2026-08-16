# Separate mobile grooming from transport, and tie staff to a specific van

## What I found

- The **Mobile Groomer** role in the database currently holds both `work.grooming_mobile` **and** `work.transport`. That second permission is why the login shows "Departments: Mobile grooming, Transport" and why the route list mixes grooming stops with pick-up / drop-off legs.
- Work mode filters jobs **only by service type and day** — there is no resource filter anywhere in the work queries. So even once transport is removed, a mobile groomer still sees the stops of all three vans (Mobile Van 1, 2, 3).
- There is no way to link a staff member to a resource: `profiles` and `tenant_users` have no resource column, and no join table exists. Resources today are Groomer 1-4, Mobile Van 1-3, Pick Up / Drop Off Vehicle, Daycare, Dog Hotel, Cattery.

## 1. Un-mix the roles

- Remove `work.transport` from the **Mobile Groomer** role. It keeps `work.grooming_mobile` only.
- **Driver** keeps `work.transport` only (already correct).
- Anyone who genuinely does both can be given both roles in Users & roles — nothing is hard-coded.
- The `/work/vans` screen stays visible to either permission, but now shows only the jobs the permission covers: grooming stops for a mobile groomer, pick-up / drop-off legs for a driver, both for someone holding both roles.

## 2. Assign staff to a van (or groomer station / vehicle)

New link between staff and resources so "Mobile Driver 1" belongs to Mobile Van 1.

- New table holding tenant, resource and staff member, with a staff member allowed on more than one resource if needed.
- **Settings → Resources**: each resource row gets an "Assigned staff" control listing tenant staff to tick. This is the settings-first home for it, so the owner manages van crews without a developer.
- **Users & roles → Edit user**: mirror of the same thing from the person's side — pick which vans / stations / vehicles they work on.

## 3. Filter work mode by the assignment

- My day, My route and the job screens show only jobs on the resources the signed-in user is assigned to, plus jobs that have no resource yet (flagged "Unassigned" so nothing goes missing).
- If a user has no resource assignment at all, they see everything for their department, as today — so nothing breaks before assignments are made.
- Admin, front desk and the full admin boards are unaffected: they keep seeing all vans.

## Technical notes

- Migration: delete the `work.transport` grant from `staff_groomer_mobile`; create `public.resource_staff` (tenant_id, resource_id, profile_id, unique pair) with GRANTs to authenticated/service_role, RLS scoped to the tenant, write gated on `settings.manage` / `users.manage`, read allowed to tenant staff.
- Frontend: `useWorkDepts` picks up the permission change automatically; add a `useMyResources()` hook and pass the resource ids into `useWorkJobs` in `src/features/work/queries.ts` (filter `resource_id in (...) or is null`), used by `MyDayPage`, `VansWorkPage`, `DaycareWorkPage`, `HotelRoundsPage`.
- Settings UI: extend `ResourcesPage.tsx` / `ResourceFormModal.tsx` with the staff picker, and `EditUserDrawer.tsx` with the resource picker; both write to the same table.
- Verify afterwards by signing in as Mobile Driver 1: departments should read "Mobile grooming" only, and the route should list Mobile Van 1's stops with no pick-up / drop-off legs.
