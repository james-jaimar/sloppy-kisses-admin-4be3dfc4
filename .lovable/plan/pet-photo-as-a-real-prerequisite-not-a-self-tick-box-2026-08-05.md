# Pet photo as a real prerequisite (not a self-tick box)

Today the only enforced pre-booking check is vaccinations (`vax_gate_mode` per service, checked server-side in `portal-create-booking` and surfaced in the admin gate panels). Pet photos get uploaded but nothing checks them — no code reads a `pet_photo` document outside the hotel intake form's "outstanding" list. This adds photos as a first-class, settings-driven requirement alongside vaccinations.

## What the owner gets

- Every pet has a visible readiness state: **Photo on file / missing**, next to the existing vaccination state.
- Hotel and Daycare require a photo before a booking can be confirmed. Grooming and Pick-up/Drop-off do not.
- Each service's requirement is a setting (Off / Warn / Required), so it can be changed without a developer.
- Admin/manager can waive a missing photo for a pet with a reason and an expiry date, exactly like the vaccination waiver.
- Wherever a photo is missing, the fix is one tap away: upload on the spot, or scan the QR and send it from a phone.

## Enforcement points

```text
Portal booking wizard  -> blocks the final step, shows the uploader
Admin booking modal    -> warns on save, blocks Confirm when Required
Booking detail page    -> readiness panel with waive + upload actions
Check-in (work mode)   -> warning chip only, never blocks arrival
```

Check-in never hard-blocks: the dog is already on site, so staff get a warning and can snap the photo there and then.

## Technical detail

**Database (one migration)**
- `daycare_workflow_settings`, `hotel_workflow_settings`, `grooming_workflow_settings`, `transport_workflow_settings`: add `photo_gate_mode text not null default 'off'` (`off` | `soft` | `hard`), seeded to `hard` for hotel and daycare, `off` for grooming and transport.
- `pets`: add `photo_waived_until date`, `photo_waiver_reason text`, `photo_waiver_by uuid`, `photo_waiver_at timestamptz` — mirroring the existing vax waiver columns.
- New security-definer RPC `pet_photo_status(p_pet_ids uuid[])` returning `pet_id, has_photo, document_id, waived_until`. "Has photo" = a non-deleted `documents` row with `type = 'pet_photo'` and status not `rejected`.
- New security-definer RPC `booking_photo_gate(p_booking_id uuid)` returning `pet_id, pet_name, status` (`ok` | `waived` | `missing`), following the shape and grants of `hotel_can_confirm_booking`.

**Server enforcement**
- `portal-create-booking`: after the vaccination gate, run the same pattern for photos using the service's `photo_gate_mode` — reject with a clear per-pet message when `hard`, pass a warning through when `soft`.

**Frontend**
- `src/features/pets/photoGateQueries.ts`: `usePetPhotoStatus`, `useBookingPhotoGate`, `useWaivePetPhoto`.
- `PhotoGatePanel.tsx` (sibling of `HotelVaxGatePanel`) on `BookingDetailPage` for hotel/cattery/daycare bookings, with a waive action and an inline `PetAttachments` uploader.
- `BookingFormModal`: reuse the panel; disable Confirm while a `hard` gate is failing.
- Portal hotel/daycare wizards: the existing "Photos & vaccination cards" section becomes blocking when the mode is `hard` — Next/Submit stays disabled until each pet has a photo or a waiver.
- `PetDetailPage` and portal `MyPetsPage` / `MyPetDetailPage`: a photo chip from the same status hook, with an upload action when missing.
- Settings: a "Pet photo required" select on the Hotel, Daycare, Grooming and Transport workflow pages, using each page's existing form pattern.

**Not in scope**
- Changing `pets.photo_url` behaviour or making the uploaded S3 photo the avatar everywhere — readiness reads documents; wiring the photo into avatars is a follow-up if wanted.