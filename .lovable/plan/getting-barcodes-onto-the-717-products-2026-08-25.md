# Getting barcodes onto the 717 products

All 717 products are loaded and none has a barcode yet, so this is a one-off labelling pass plus an ongoing "new stock arrived" path. Three pieces already exist and get reused: the phone QR handoff (photo studio), the till's keyboard-wedge scanner, and the unknown-barcodes queue with its link-to-product sheet.

## 1. Phone barcode mode (walk the shelves)

Shop & Stock gains a **Barcodes** screen with the same QR handoff as the photo studio. Scan the code on the tablet, and the phone opens a barcode-capture page:

- Camera opens on the barcode scanner. Scan a product's barcode.
- The code shows in large type, then a search box to find the product by name, SKU or Xero code (as chosen — search/pick each time, no forced worklist).
- Tap the product, it saves and beeps, and the camera reopens for the next item.
- If that code is already on another product, the phone says which one instead of overwriting.
- A running counter: "43 saved · 674 still without a barcode", and a "recently saved" list with undo on the last one.
- Phones whose browser can't scan (no BarcodeDetector) fall back to typing the digits — the same fallback the photo studio uses.

## 2. Desk scanner mode (bring stock to the counter)

The same **Barcodes** screen has a desk mode for a USB/Bluetooth scanner:

- Big "Ready to scan" panel. Scan the code; it lands in the box automatically.
- Search and pick the product, save, and focus returns to the scan box for the next item.
- Shows the last 10 saved rows so mistakes are obvious immediately, each with undo.
- A filter to work only through products that still have no barcode, so progress is visible.

## 3. Ongoing capture at the till

Already in place and unchanged in behaviour: an unrecognised scan at the till opens the link sheet (or just warns, per Retail settings), and unresolved codes collect in **Unknown barcodes** for later linking. New stock therefore self-labels through normal selling.

## 4. Product form

The product form's barcode field gets a small **Scan** button that opens the phone handoff for that single product, mirroring the per-tile phone button on the photo studio.

## Settings

Retail settings gains one switch: **Allow multiple barcodes per product** — off by default. Off means one code per product and a clash is refused; on stores extras (multipacks, relabelled stock) so both codes ring up the same item. Everything else reuses the existing till/scanning settings.

## Technical notes

- Migration: `product_barcodes` table (`tenant_id`, `product_id`, `code`, `is_primary`, `created_by`) with GRANTs for `authenticated`/`service_role` and RLS mirroring `products`, plus a unique index on `(tenant_id, lower(code))`. `products.barcode` stays as the primary code and is kept in sync by trigger, so the POS lookup and existing queries don't change. New `retail_settings.allow_multi_barcode` boolean.
- POS lookup extends to check `product_barcodes` as well as `products.barcode`.
- Edge function: `snap-upload` gains `mode = 'barcodes'` sessions and a `link-barcode` action (validates the token, checks for a clash, writes the code, closes matching `pos_barcode_queue` rows). Product search reuses the existing `products` action.
- Frontend: new `src/pages/SnapBarcodes.tsx` (public, token-authorised) routed at `/snap/barcodes/:token`; new `src/features/shop/BarcodesPage.tsx` with phone/desk tabs; reuse `useBarcodeScanner`, `playTone`, `useLinkBarcode` and `StudioSnapDialog` (generalised to take a mode and a progress label).
- Permission gating: both modes require `pos.barcode.link`; the Barcodes screen appears in the sidebar only for roles holding it.

## Build order

1. Migration (`product_barcodes`, index, settings column, sync trigger).
2. `snap-upload` barcode session + link action.
3. Phone barcode page.
4. Desk scanner tab and progress counters.
5. Product-form scan button and POS multi-barcode lookup.
