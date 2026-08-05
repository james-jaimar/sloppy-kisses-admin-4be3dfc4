# Phone upload should finish itself

## What happens now

The phone finishes the upload and the desktop dialog shows the file with a green tick — then nothing. It stays open until the user closes it manually, and the tile behind it only refreshes on close. There is no way to see what arrived or swap it for a different picture from inside the dialog.

## What changes

1. **Auto-accept and close.** As soon as every file in the session reaches `uploaded`/`verified`, the dialog shows a short "Photo received" confirmation with a preview thumbnail, refreshes the record, and closes itself after about 1.5 seconds. Manual close still works and still refreshes.
2. **Confirmation lands on the tile.** The pet photo / vaccination tile flips to the green "On file" state immediately (the attachment status query is invalidated the moment a file completes, not on dialog close), with a toast naming the pet and the document.
3. **Thumbnail + change.** The tile shows a small preview of the photo on file and a "Replace" action (already present for the file picker) plus "Use my phone" — so a customer or admin can swap the picture at any time without hunting for it.
4. **Session closed after success.** The upload session is marked closed once the desktop accepts the file, so the QR link can't be reused after the fact.

## Technical notes

- `SnapUploadButton.tsx`: watch `docs.data`; when at least one document is `uploaded`/`verified` and none are `pending`, fire `onUploaded()`, stop polling, render the success state, then `setOpen(false)` on a timer. Clear session state on close so a re-open mints a fresh token.
- `snapQueries.ts`: add a `useCloseSnapSession` mutation calling `snap-upload` with `action: "close"`, and a small hook to fetch a signed preview URL for a document via `documents-sign-download`.
- `PetAttachments.tsx`: `usePetAttachmentStatus` returns the document id/name alongside the boolean so the tile can render a thumbnail; keep the existing Replace/Use-my-phone buttons.
- `supabase/functions/snap-upload/index.ts`: add a `close` action (token/session owner authorised) that sets `closed_at`.

## Verification

Upload a pet photo by QR from a phone on the hotel booking form: dialog confirms and closes on its own, tile shows the thumbnail and "On file", and re-scanning the old QR is rejected.
