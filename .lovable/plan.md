# One-tap pet photos everywhere

## What already exists

The pieces are half there: a pet photo can already be attached in a few places (the pet
paperwork tiles and the booking photo check), it saves as a "pet photo" on the pet's record,
and the phone QR handover already works for shop product photos and paperwork. What's missing
is a quick, obvious "take a photo of this dog" action in the places staff actually work, and the
photo showing back as the pet's picture.

## What I'll build

**1. A single photo button used everywhere**
A small camera button with three ways to add a picture:
- On a phone or tablet: opens the camera straight away.
- On a desktop: "Use my phone" shows the QR code, staff scan, snap, and it lands instantly.
- Or choose an existing file.

The newest photo becomes that pet's current picture. Older ones stay on the pet's file so you
keep a history, and you can set an older one back as the main picture.

**2. The pet's picture shown, and tappable to refresh**
A round pet picture (initials when there's none yet) that staff tap to take a new photo.
It appears on:
- Pet profile page and the pets list
- Customer profile (their pets)
- Daycare board cards, daycare list and check-in/out rows
- Staff Work Mode: my-day list, job screens, hotel rounds, van route stops
- Booking drawers and the arrivals/departures views
- Print lists keep working as they do now

**3. Who can do it**
Anyone with the existing pet-edit access, which covers admins, front desk, daycare, grooming,
hotel and van staff. If you'd rather it be its own permission, say so and I'll add one in
Settings → Roles instead.

**4. Small quality touches**
- Photos are shrunk and square-cropped before saving, so the phone doesn't upload huge files.
- A "photo taken today" tick so staff can see when the picture is fresh.
- The existing booking photo requirement is satisfied automatically by the new photo.

## Technical notes

- New shared components `PetPhotoButton` and `PetAvatar` in `src/features/pets/photo/`,
  built on the existing `SnapUploadButton`, `uploadDocumentToS3` and `documents` (`type = 'pet_photo'`).
- New hook `usePetPhotos(petIds)` returning the latest signed thumbnail URL per pet, cached; batch
  fetch so lists don't fire one request per row.
- Client-side downscale/crop to ~800px square JPEG before upload.
- Reuse the snap-upload edge function unchanged; sessions already accept `pet_id` + `doc_type`.
- Optional `is_primary` handling done by ordering on `created_at`, plus a "make main photo" action
  that re-stamps the chosen document — no schema change required.
