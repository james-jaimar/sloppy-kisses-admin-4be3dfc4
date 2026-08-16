# Correct the Mobile Van grooming workflow

## Confirmed diagnosis

- The Mobile Groomer permission maps to `grooming_mobile`, and the route query filters to that service plus the staff member’s assigned resource. The Mobile Van 1 assignment is therefore selecting the correct appointments.
- The confusion is in the shared route UI: every stop receives the transport-only **Collected** and **Dropped** buttons, regardless of whether its service is mobile grooming or pickup/drop-off.
- The opened job has a related mismatch: only in-house grooming currently receives **Start grooming**. A mobile grooming job falls through to the generic **Start** action instead.

## Changes

1. **Make route-stop controls service-aware**
   - Keep pickup/drop-off stops on the existing **Collected → Dropped** workflow.
   - Give mobile grooming stops the established grooming sequence: **Check in → Start grooming → Ready for collection**, with completed/current states clearly shown.
   - Show a visible **Mobile grooming** or **Pick up / drop-off** service label on each route card so mixed-role staff can distinguish the job type immediately.
   - Preserve the phone-first card layout, call button, route order, and link to the full job.

2. **Correct the full mobile grooming job flow**
   - Treat both in-house and mobile grooming as grooming in the next-step logic.
   - Ensure mobile jobs use **Start grooming**, the `grooming` status, timer stamping, **Ready for collection**, checklist, photos, notes, incidents, and sign-off already supported by the job page.

3. **Prevent regression**
   - Extract and test the service-aware next-action decision so mobile grooming and transport cannot silently share the wrong controls again.
   - Verify a Mobile Groomer assigned to Mobile Van 1 sees only that van’s mobile grooming bookings (plus unassigned mobile grooming), while a Driver sees pickup/drop-off bookings and transport controls.

## Technical scope

Frontend work-mode logic only; no schema, role, permission, resource-assignment, or booking-data migration is needed for this correction.