# Fix before/after photos in Work Mode, and drop the QR button

## What is going wrong

The camera opens and the file is picked, but the photo never lands. The app creates the document record and then asks the phone browser to send the picture straight to Amazon S3. That cross-origin send from a mobile browser is exactly the failure we already hit on the phone-upload page — the code there says so in a comment, and that page was changed months ago to post the bytes through our own server instead.

Evidence: the only recent document row is the 05:29 attempt from this morning — `type: booking_photo`, size 2.5MB, still stuck at status `pending`. The record was created fine, so sign-upload and permissions are fine; the browser-to-S3 step never completed, so the confirm step never ran and no photo was attached to the job.

## The fix

1. **Send job photos through our server, like the phone page already does.** Add an authenticated upload endpoint that accepts the file itself and forwards it to storage server-side, then marks the document `uploaded`. Work Mode's before/after buttons use this path, so nothing depends on a mobile browser reaching S3 directly.
2. **Use the same path everywhere in the app** (pet photo, vaccination card, proof of payment) so no other screen is left on the fragile route. Keep the existing sign-then-PUT code as a fallback if the proxy call fails.
3. **Remove the two "Use my phone" buttons from the job photo panel.** A groomer on a tablet or phone is already on the device with the camera; the QR code sends them nowhere useful. The buttons stay on desk-based screens (pet photo, vaccination) where a QR handoff makes sense.
4. **Clear feedback.** If an upload fails, show the real reason and a "Try again" that re-sends the same picture instead of making the groomer re-shoot it. Show a spinner on the tile while sending and the thumbnail as soon as it lands.
5. **Tidy the stuck row.** Mark the abandoned 05:29 `pending` document as failed so it doesn't linger as a phantom attachment.

## Technical notes

- New edge function `documents-upload` (or a `multipart` branch on `documents-sign-upload`): accepts `multipart/form-data` with tenant/pet/customer/booking/type plus the file; enforces the tenant `max_upload_mb` limit; inserts the `documents` row as the caller (RLS unchanged); `signStorageUrl(key, "write")` then PUTs server-side; sets status `uploaded`, size, content type; returns `document_id`. Mirrors the existing multipart branch in `snap-upload/index.ts`.
- `src/features/documents/uploadDocument.ts`: `uploadDocumentToS3` posts to the new function first, falls back to the current sign → PUT → confirm chain on network error.
- `src/features/work/JobPhotos.tsx`: delete the two `SnapUploadButton` entries and their `useLinkJobPhoto` handlers; add per-kind error state with a retry that reuses the held `File`.
- No schema changes; `booking_photos` insert and `documents` policies already allow staff.

## Verification

Log in as the mobile groomer on a phone, open a job, take a before photo and an after photo: both appear as thumbnails, both `documents` rows reach status `uploaded`, and the panel shows no QR buttons.
