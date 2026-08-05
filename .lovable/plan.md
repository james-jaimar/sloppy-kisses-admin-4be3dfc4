# Fix: phone upload says "Load failed", desktop spins forever

## What the evidence shows

- The `snap-upload` function logs show **no errors** for your attempt (07:02–07:05) — every call it handled succeeded.
- The document row for `family&dog.jpeg` exists with `uploaded_via: phone`, `size_bytes: 2,236,840`, a valid storage key, and `status: pending`.

So: creating the session worked, and asking for a signed upload link worked. What failed is the step after that — the phone browser sending the file bytes **directly to storage**. "Load failed" is the browser's wording for a request that never completed (network or cross-origin rejection), which is why nothing reached our logs. The desktop keeps spinning because it only flips to a tick when the confirm step marks the document uploaded, and that step never ran.

The exact reason the direct-to-storage PUT is refused (bucket CORS, link expiry, mobile network) is **not confirmed** — the browser deliberately hides it. Rather than guess, the fix removes the dependency on that direct browser-to-storage call.

## The fix

**1. Upload through our own function instead of straight to storage**

The phone posts the file to `snap-upload` (same endpoint it already talks to, CORS already correct), and the function forwards the bytes to storage server-side. No third-party cross-origin request from the phone at all — the part that is failing disappears.

Keep the current direct path as a fast path: try direct first, and if it throws, retry through the function.

**2. Stop the silent spin**

- Phone: show the real failure reason instead of a bare "Load failed", plus a Retry button on the failed file.
- Desktop: files stuck pending for more than ~60 seconds show "Upload didn't finish — try again on the phone" instead of spinning forever.
- Sign and forward failures get logged server-side so the next incident is visible in the function logs.

**3. Clean up the orphan**

The one pending row from this attempt has no bytes behind it. It gets removed so the pet's photo tile doesn't show a half-uploaded file.

## Verification

- Upload a photo from a phone via the QR link: the tile flips to a tick on the desktop within a few seconds.
- Check the pet's documents: one row, status uploaded, with a real size and checksum.
- Force a failure (airplane mode mid-upload) and confirm the phone shows a readable error with Retry, and the desktop shows the stalled state rather than an endless spinner.

## Technical notes

- `supabase/functions/snap-upload/index.ts`: new `upload` action accepting `multipart/form-data` (token + document_id + file), which PUTs to the signed URL from inside Deno and then runs the existing confirm logic, respecting the tenant's `max_upload_mb`.
- `src/pages/SnapUpload.tsx`: direct PUT wrapped in try/catch, falling back to the new `upload` action; error text surfaced; per-file retry.
- `src/features/uploads/SnapUploadButton.tsx`: stalled-pending indicator based on the document's `created_at`.
- No schema changes required.