# Photo studio on your phone (QR handoff)

Staff open the Photo studio on the tablet or desktop, scan one QR code, and then work
through the whole product list on their phone camera. Every photo lands on the right
product instantly and shows up on the till.

## How it will work

1. **One QR for the whole session.** A "Use my phone" button at the top of Photo studio
   opens a QR code. Scanning it opens a stripped-back phone page — no login, the link is
   the credential, and it expires (default 15 minutes, extendable by tapping "Keep going").
2. **Phone page = mobile photo studio.** Search box, category filter, and the same
   "Needs a photo" / "All products" toggle. Tap a product, the camera opens, take the
   shot, it saves and the tile turns green with the thumbnail. Move to the next product —
   no re-scanning of the QR between photos.
3. **Barcode shortcut.** On the phone the staff member can also tap "Scan barcode" to jump
   straight to the matching product instead of searching by name. (Uses the phone camera;
   if the browser can't scan, the search box is the fallback.)
4. **Live on the desktop.** The Photo studio grid refreshes as photos arrive, so the
   "Needs a photo (325)" counter drops in real time while the phone is being used.
5. **Per-tile QR too.** Each product tile keeps a small "phone" action for a one-off shot
   of a single product, for when someone just wants to fix one picture.
6. **Session control.** The desktop dialog shows how many photos have landed and a
   "Finish" button that closes the link so the QR can't be reused. Expiry and file cap
   come from the existing document settings, per the settings-first rule.

## Technical notes

- Schema: add `product_id uuid` and `mode text` (`single` | `studio`) to `upload_sessions`;
  raise `max_files` for studio sessions (settings-driven, default 200).
- `snap-upload` edge function gains:
  - `create` accepts `mode: "studio"` and optional `product_id`, verifying the caller can
    read products for that tenant (`pos.operate` / shop permission already gates the page).
  - `products` action (token-authorised): returns a paged, searchable product list
    (id, name, category, has_photo, barcode) for the session's tenant only.
  - `product_photo` multipart action: accepts `token`, `product_id`, and the file; verifies
    the product belongs to the session tenant (and matches `product_id` for single mode),
    uploads to the existing `product-images` Supabase bucket with the same key convention as
    `uploadProductImage`, deletes the old object, then updates `products.image_url`.
    Product photos stay in Supabase storage — they are not routed into `documents`/S3.
  - `extend` action to push `expires_at` out while a session is actively uploading.
- Frontend:
  - `src/features/shop/ProductPhotosPage.tsx`: header "Use my phone" button (reuses
    `SnapUploadButton` styling but a new studio dialog), per-tile phone action, and polling
    invalidation of the product query while a session is open.
  - New `src/features/uploads/StudioSnapDialog.tsx` — QR + live counter + Finish.
  - New public route `/snap/studio/:token` → `src/pages/SnapStudio.tsx`: the mobile grid,
    search, category filter, camera capture, per-tile busy/done state, and barcode scan.
  - `snapQueries.ts`: `useCreateStudioSession`, `useStudioSessionProgress`.
- Security: token sessions can only touch products in their own tenant, can only set
  `image_url`, are capped by file count and expiry, and are closed by the desktop when done.

## Verification

Open Photo studio on the tablet, scan the QR with a phone, photograph three products in a
row (one found by barcode), and confirm each tile turns green on the phone, the desktop
counter drops, the images appear on the till grid, and re-scanning the QR after "Finish"
is rejected.
