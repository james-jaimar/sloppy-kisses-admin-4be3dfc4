# Load the 392 product photos into the POS

## The database is already right — nothing to change

Checked the live data:

- 717 products, every one carrying its Xero item code in `external_code`.
- `image_url` is empty on all 717 — nothing to overwrite.
- A private `product-images` storage bucket already exists, and the app already resolves images from it (signed URLs) on the products list, the product form, the POS grid and the Photo studio.

The spreadsheet's `image_file` names (`images/1001 Triworm-D Blue (Small).jpg`, `images/157037.jpg`, …) are exactly the Xero item codes, so they join straight onto `external_code`. 392 rows have a file; 307 are `MATCHED`, 90 `REVIEW`, and 320 SKUs still need store photography.

## How to get the images to me

Zip the images folder and attach the zip in chat (single file, keep it under 20MB — if it's larger, split into two or three zips, e.g. A–M / N–Z, and send them in one message).

I unpack it in the sandbox and upload from there. You don't need to touch storage yourself.

## What I'll do with them

1. Unzip and list the files, then match each filename (minus extension) to `products.external_code`.
2. Report any mismatches before uploading: files with no matching product, and spreadsheet rows whose file is missing from the zip.
3. Resize/compress each image to a max 1200px long edge (POS tiles and the products list never need more), so the till stays fast on the tablet.
4. Upload each to `product-images` as `{tenant_id}/{product_id}.jpg` and set `products.image_url` to that path — the same convention the Photo studio already writes, so replacing a photo later works unchanged.
5. Print a reconciliation summary: uploaded, skipped, still without a photo.

## After the load

- The **Photo studio** ("Needs a photo") count drops to the ~325 items with no stock photo, so staff can work through the remainder on a tablet.
- The `REVIEW` rows are still loaded — a wrong-looking photo is easier to spot and replace on screen than to chase in a spreadsheet. I'll optionally flag them in the product notes if you want them tracked.

## Technical notes

- Matching is on `external_code` (unique per tenant), case-insensitive, trimming whitespace.
- Upload runs server-side from the sandbox with the service role, in batches, idempotent — re-running replaces the same object path rather than creating duplicates.
- No schema migration needed; only `products.image_url` values change.
