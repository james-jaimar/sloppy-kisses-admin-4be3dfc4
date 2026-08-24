# Wire up the shop: staff role, till resource, POS paging, and barcode capture

Three separate gaps, all confirmed against the live project:

- There is no shop role. The 12 roles today are Owner, Admin, Front Desk, Accounts, Read Only, Daycare, Hotel, Grooming, Mobile Groomer, Driver, Customer, Platform Owner. Only Owner/Admin/Platform Owner hold `pos.operate`, so `shop@sloppykisses` has nothing sensible to be assigned.
- There are no shop-specific permission codes beyond `pos.operate`, `products.view` and `products.manage` — nothing for stock, and nothing for barcode linking.
- The POS grid renders every filtered product in one list (717 on "All"), and only the first 200 get image URLs resolved.

## 1. Shop Staff role and permissions

New permission codes, so the role editor can switch each one on or off per role:

- `pos.operate` (exists) — run the till
- `pos.barcode.link` — link an unknown scanned barcode to a product
- `stock.view`, `stock.adjust` — stock counts, receiving, wastage
- `products.photos` — upload/replace product photos without full product editing

New **Shop Staff** role (`staff_shop`), seeded with: `pos.operate`, `pos.barcode.link`, `products.view`, `products.photos`, `stock.view`, `customers.view`, `invoices.view`. Everything in that list stays editable in Admin → Users & roles, so you can widen or narrow it after checking with Charlotte — including handing barcode linking to admin only by clearing `pos.barcode.link` on the role.

Front Desk and Accounts also get `pos.operate` and the stock codes, since they cover the counter.

Login routing: a Shop Staff user has no admin-area permissions, so they currently land on `/admin/home` with an empty sidebar. They will land straight on the till (`/admin/pos`), with Shop & Stock as their only sidebar entry.

## 2. Shop as a real resource

`resource_type` gains `retail_till`, so a till is a first-class resource like a van or grooming station:

- A "Front counter till" resource is created for the tenant, and Retail settings gains a **Till resource** picker next to the existing till name / receipt footer / stock location fields.
- Staff are attached to a till through the existing `resource_staff` table, so the same "who works where" screen used for groomers and vans covers shop staff.
- Sales record which till resource rang them up, so end-of-day totals can be split per till later.

## 3. POS grid paging

- 24 products per page (tablet-friendly: 4 across x 6 down at counter size, fewer columns stack), with Prev / Next and "Page 2 of 30".
- Page resets to 1 whenever the search, category, sub-category or brand filter changes.
- Only the visible page's images are signed, which removes the current 200-image ceiling and cuts the work the till does on load.
- The item count stays visible ("717 items · page 1 of 30").

## 4. Unknown barcode capture

Today an unrecognised scan just flashes "No product for 123456" and is lost. Instead:

- The scan opens a **Link this barcode** sheet: the code in large type, a product search box (name / SKU / Xero code), and recent scans of the same code.
- Picking a product saves the barcode to that product, adds it to the current sale, and beeps as a hit. Next time it scans straight through.
- If the code is already on another product, the sheet says which one instead of silently overwriting.
- Staff without `pos.barcode.link` get a different sheet: "Unknown item — flag for admin", which records the code and, optionally, a note. Nothing is added to the sale.
- Unresolved codes collect in **Shop & Stock → Unknown barcodes**, showing the code, how many times it has been scanned, when it was last seen and who scanned it, with the same link-to-product action. Resolved rows drop off the list.

## 5. Settings, per the settings-first rule

Admin → Settings → Retail gains a **Till & scanning** section:

- Till name, receipt footer, stock location, till resource (existing + new picker).
- **Who can link barcodes** — All till staff / Admin only. This flips `pos.barcode.link` for the Shop Staff role, so it is one switch rather than a permission hunt.
- **Products per page** at the till (12 / 24 / 36 / 48).
- **On an unknown barcode** — open the link sheet / just warn.
- **Beep on scan** on/off.

Existing Brands and Categories settings screens stay as they are.

## Technical notes

- Migration: add `retail_till` to `resource_type`; new `permissions` rows + `role_permissions` seeds; `staff_shop` role per tenant; `pos_barcode_queue` table (tenant_id, code, scan_count, first_seen_at, last_seen_at, last_scanned_by, note, resolved_product_id, resolved_at) with GRANTs for `authenticated`/`service_role` and RLS mirroring `products`; unique partial index on `(tenant_id, lower(barcode))` for products so a barcode can't be double-assigned; new `retail_settings` columns (`till_resource_id`, `pos_page_size`, `unknown_barcode_action`, `scan_beep`).
- Frontend: `PosProductGrid` takes `page`/`pageSize` and signs only the visible slice; new `BarcodeLinkSheet` in `src/features/pos/`; `UnknownBarcodesPage` under `src/features/shop/`; `landingFor` in `src/lib/auth/landing.ts` learns the till landing; `navigation.ts` gains the unknown-barcodes and till entries gated on the new codes.
- No change to the sale/invoice pipeline — barcode linking only writes `products.barcode`.

## Build order

1. Migration (permissions, role, till resource type, barcode queue, settings columns).
2. Role seeding + login routing + sidebar gating, so `shop@sloppykisses` works end to end.
3. POS paging.
4. Barcode link sheet + unknown-barcodes screen.
5. Retail settings section for the new switches.
