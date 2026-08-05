# Fix: pet photo upload fails from the hotel booking form

## What's actually wrong

The browser error is not a CORS bug in the code. Confirmed by calling the endpoint directly:

```text
OPTIONS .../functions/v1/snap-upload
HTTP/2 404  {"code":"NOT_FOUND","message":"Requested function was not found"}
```

The `snap-upload` edge function exists in the repo (with correct CORS headers and an `OPTIONS` handler) but is **not deployed** to the project. A 404 on the preflight is what the browser reports as "Response to preflight request doesn't pass access control check: It does not have HTTP ok status."

The second console line — `Missing Description or aria-describedby for DialogContent` — is a separate, harmless accessibility warning from the phone-upload QR dialog.

## Fix

1. Deploy `snap-upload` (it ships with `verify_jwt = false`, already set in `supabase/config.toml`).
2. Re-check the same endpoint after deploy: preflight must return 2xx, and a `create` call must return a session token.
3. Verify the storage secret `AWS_S3_API_KEY` is present, since `sign`/`confirm` need it — if missing, the upload would fail at the next step even with the function live.
4. Add a `DialogDescription` to the "Upload from your phone" dialog in `src/features/uploads/SnapUploadButton.tsx` to clear the accessibility warning.

## Verification

- `OPTIONS` on `/functions/v1/snap-upload` returns ok with CORS headers.
- Upload a pet photo from the hotel booking form and confirm the document lands on the pet and the photo gate flips to "On file".
- No console errors left from the dialog.
