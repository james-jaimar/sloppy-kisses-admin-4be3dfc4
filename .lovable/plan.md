# Point of Sale — a real till for the on-site shop

Turn the current "Quick sale" screen into a proper tablet POS: scan, tap, tender, done. Full-screen, big touch targets, keyboard-wedge barcode scanning, split payments, printed or emailed receipt.

## The till screen

New route `/admin/pos`, rendered full-screen without the admin sidebar so the whole tablet is the till. Layout follows the reference mockup:

- **Top bar** — Sloppy Kisses logo, a wide product search, the till/operator chip ("Front Desk"), a coral **New Sale** button, and an overflow menu.
- **Category chips** — All Products, Food, Treats, Toys, Accessories, Health, Grooming, Cleaning, More. Driven by the real `product_categories` table.
- **Product grid (left, ~70%)** — cards with a product photo, stock pill in the corner ("12 in stock", amber when low, red at zero), name, variant/size line, price, and a round coral **+** button. Tap anywhere on the card to add.
- **Sale panel (right, ~30%, sticky)** — sale/invoice number, a Walk-in / customer chip, a dedicated **scan barcode or search product** field (always focused), line rows with thumbnail, price, quantity steppers and remove, an **Add discount** row, then Subtotal / Discount / **Total**, a full-width **Charge R…** button and **Cash** / **Card** quick-tender buttons.
- **Bottom status strip** — scanner connected indicator, printer, cash drawer, **Park sale**, **Recent sales**, and Quick Add actions (Discount, Note, Gift card, More).
- Everything sized for fingers: min 48px targets, no hover-only affordances, works in portrait and landscape on a tablet.

### What I'd add beyond the mockup

1. **Product photos** — the grid only sings with images, so products get an `image_url` (uploaded via the existing document/S3 pipeline) with a tidy initials/paw placeholder when absent.
2. **Park sale (hold)** — a customer forgets their wallet or a dog needs collecting mid-sale: park the cart, serve the next person, resume from a "Parked (2)" tray. Real-world tills live on this.
3. **Live scan feedback** — a slim banner under the scan box confirming the last scan ("+1 Beefy Sticks R59.00") with beep/green flash, and a loud red state for an unknown code with a one-tap "Add this product".
4. **Recent sales / reprint & refund** — the last 20 sales in a drawer, so staff can reprint a receipt or start a return without leaving the till.
5. **Returns** — negative-quantity lines that put stock back and raise a credit note against the original invoice, using the existing credit-note machinery.

The Loyalty and Gift Card buttons from the mockup are shown as "coming soon" rather than half-built, unless you want them in scope now.


## Scanning

- A keyboard-wedge listener captures fast keystroke bursts ending in Enter, anywhere on the till screen, even if focus is lost. That covers standard 1D barcode scanners and 2D/QR scanners in keyboard mode (both behave identically).
- Match order: exact `barcode`, then exact `sku`, then a single fuzzy name match.
- Scanning the same item again bumps quantity. Unknown code shows a fast "Not found — add this product?" prompt that opens a mini product-create form pre-filled with the scanned code, so staff can barcode-in stock as they go.
- Audible beep + green flash on hit, buzz + red flash on miss.
- A separate "Scan in stock" mode on the Stock page: scan repeatedly to receive quantities into a location, for the initial inventory load.

## Customer

- Optional. Defaults to a **Walk-in** customer created once per tenant and reused for anonymous cash sales.
- Tap "Customer" to search and attach a real customer (existing customer picker), which enables emailed receipts and charge-to-account.

## Payment (tender screen)

A full-screen tender panel over the till:

- Big numeric keypad, quick-tender buttons (exact, R50, R100, R200, R500).
- **Cash** — enter tendered amount, giant CHANGE DUE figure.
- **Card / Yoco / EFT / other** — pick the method from the tenant's payment methods, optional reference.
- **Split** — add multiple tenders; a running "Still to pay" figure until the balance is zero.
- **Charge to account** — only available when a real customer is attached; leaves the invoice open and unpaid on their account.

Result: one invoice created and marked paid (or open, if charged to account), with a `payments` row per tender and stock movements per line, exactly as the current quick-sale flow does — extended for multiple tenders and the walk-in customer.

## Receipt

After payment, a completion screen with:
- **Print** — opens a clean 80mm-style receipt (logo, items, VAT, tender, change, invoice number) and triggers the browser print dialog.
- **Email** — reuses the existing branded invoice email; only enabled when a customer with an email is attached.
- **New sale** — clears everything back to an empty till in one tap.

## Admin & settings (settings-first rule)

- Retail settings gains: till name, receipt footer text, default stock location for POS, whether negative stock is allowed at the till, and the walk-in customer.
- Products gain quick barcode capture (scan straight into the barcode field).
- New permission code `pos.operate` so a shop assistant login can be given the till and nothing else; existing `products.view` still guards the catalogue.
- A "Today at the till" strip: sales count, takings by tender type, and a link to the day's invoices.

## Technical notes

- Frontend: new `src/features/pos/` module — `PosPage.tsx`, `PosProductGrid.tsx`, `PosCart.tsx`, `TenderDialog.tsx`, `ReceiptView.tsx`, `useBarcodeScanner.ts`, plus queries. The existing `QuickSalePage` stays as a lightweight fallback or is retired once POS is signed off.
- Reuse `src/features/shop/queries.ts` (`useProducts`, `useStockOnHand`, `useQuickSale`); extend the sale mutation to accept an array of tenders instead of one payment, and to skip the payment when charging to account.
- Database: no new tables needed. Small migration for a `pos_settings`-style extension to `retail_settings` (till name, receipt footer, default location, walk-in customer id), the `pos.operate` permission row, and an index on `products.barcode` for instant scan lookups. All with the required GRANTs.
- Receipt printing is pure CSS `@media print` on a dedicated receipt component — no native driver needed; any printer the tablet can reach works.
- Money and VAT follow the existing invoice logic (ZAR, VAT-inclusive rates), so Xero sync and the accounting screens keep working unchanged.

## Build order

1. POS shell + product grid + cart + scanner (usable till, cash only).
2. Tender screen: cash, card/EFT, split, charge to account.
3. Receipt print + email + new-sale reset.
4. Settings, permission, walk-in customer, scan-in-stock mode, today's takings.
