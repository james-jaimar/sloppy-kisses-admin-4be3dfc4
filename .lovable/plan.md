# Hotel form: real attachments, phone-to-desktop upload, and the mystery error

## 1. Find out what that error actually was

The toast said only "unknown". That is a bug in our error handling, not the real message: when the booking edge function replies with a 4xx, the Supabase client puts the body in `error.context`, not in `data`, so our code falls back to the literal string `"unknown"` and the real reason (lead time, no availability, vaccinations, a database message) is thrown away.

Fix first, then diagnose:

- Read the response body off the failed call and show the real reason, mapped to the friendly wording we already have for lead time, availability, vaccinations, etc.
- Log the raw code to the browser console so failures are traceable.
- Add server-side logging in the booking function for every non-success reply, so the same failure is visible in the function logs next time.

Note: the function logs for the time of your attempt show no crash, which means it returned a handled rejection (a 400/403/409) — the fix above will name it. Until then the cause is unconfirmed, so no other change is made on the assumption of a specific cause.

## 2. "Important attachments" becomes real, not a tick list

Today the section is five checkboxes the customer ticks themselves — an office checklist, exactly as you said. Replace it with two groups:

**Customer-facing (per pet, in the booking form):**
- A photo of the pet and a vaccination card upload, shown per pet card.
- Each tile shows one of three states: already on file (green, pulled from the pet's existing documents/vaccinations), just uploaded now, or missing.
- Uploading here saves straight into the pet's documents via the existing S3 pipeline, tagged `pet_photo` / `vaccination`, so it lands in the pet record — not just the booking.
- Missing items become a soft warning on the confirmation step ("we still need a vaccination card for Bella"), never a hard block unless the vaccination gate is already set to hard.

**Office-facing (admin only, on the booking):**
- "Food packed in labelled bags", "Medication instructions received", "Grooming requested" move to a staff checklist on the booking's accommodation card, tickable by staff at check-in, with who ticked it and when.

## 3. Phone-to-desktop upload handoff

Borrowing the Print My Pics idea: any upload spot in the app (pet photo, vaccination card, before/after job photos, documents panel) gets a "Use my phone" button.

```text
Desktop                         Phone
[Use my phone] -> QR code  -->  scans QR
                                opens /snap/<token>
                                take photo / pick file
   uploads appear live  <--     uploads
   attached to the record
```

How it works:
- A short-lived upload session (default 15 minutes, single customer/pet/booking target) is created when the button is pressed, with a random token.
- The QR encodes a public URL `/snap/<token>` on our own domain. The phone page is a stripped-back camera/file screen — no login needed, the token is the credential, and it only ever allows uploads into that one target.
- Files go through the same signed-URL S3 flow we already use, with the session token authorising the sign step instead of a logged-in session.
- The desktop page subscribes to the session and shows thumbnails as they land, so the customer or staff member never has to email themselves a photo.
- Sessions expire, are single-target, capped (e.g. 10 files, 10 MB each, images and PDFs only), and can be closed manually. Expiry, file cap and allowed types are Settings values, per the settings-first rule.

Available to both customers (portal) and staff (admin and work mode).

## Technical notes

- Frontend: `useBookingSubmit.ts` error parsing; `AccommodationFields.tsx` attachments section replaced by a per-pet uploader component reusing `uploadDocumentToS3`; the same component used by `AccommodationFormPage.tsx` and `BookingFormModal.tsx`.
- New table `upload_sessions` (token hash, tenant, target pet/customer/booking, created_by, expires_at, max_files, closed_at) with RLS; a public route `/snap/:token`; edge function changes in `documents-sign-upload` / `documents-confirm-upload` to accept a session token as an alternative to a user session, validating target and limits server-side.
- New staff checklist columns on `hotel_booking_details` (or a small `booking_checklist_items` table) for the office items, with tick author and timestamp.
- Realtime subscription on the session's documents for the live desktop preview.

## Order of work

1. Real error messages on portal booking submit (fast, unblocks diagnosis).
2. Per-pet photo / vaccination card uploads replacing the tick list; office checklist moved to admin.
3. Phone-to-desktop upload sessions, wired into the new uploaders first, then the other upload spots.
