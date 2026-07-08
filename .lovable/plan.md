## Where we are

Phases 2–9 are scaffolded:
- Grooming, Hotel & Cattery, Mobile Vans, Pickup/Drop-off, Daycare boards
- Invoices & Payments
- Comms + vaccination gate
- Customer Portal (dashboard, pets, bookings, invoices, payments, documents, profile)

Roadmap items still ahead: **Retail / Shop & Stock**, **Reports**, **Users & Roles**, plus deferred pieces (real payment gateway, two-way messaging).

## Recommended next: Phase 10 — Retail / Shop & Stock

This is the next unbuilt operator surface and the sidebar already has a "Shop & Stock" entry pointing at a placeholder. It closes the loop between grooming/daycare/hotel visits and over-the-counter product sales (food, treats, accessories, take-home meds), and it feeds directly into invoices we already built.

### What we'll build

1. **Products catalogue** (`/admin/shop-stock/products`)
   - List with search, category filter, active toggle, low-stock chip.
   - Product form: name, SKU, category, unit, cost price, sell price, VAT flag, barcode, reorder level, active.
2. **Stock levels & movements** (`/admin/shop-stock/stock`)
   - Current on-hand per product per location, last movement, low-stock highlights.
   - Manual adjustment drawer (receive stock, wastage, count correction) writing to a `stock_movements` ledger.
3. **Point-of-sale / Quick sale** (`/admin/shop-stock/sale`)
   - Scan or pick products → cart → attach to a customer (optional) → creates an invoice (reuses existing invoice + payment flow) → deducts stock via movement rows.
4. **Attach products to a booking**
   - "Add product" action on `BookingInvoicePanel` so a groomer/hotel handover can add a bag of food to today's booking invoice; deducts stock the same way.
5. **Settings**
   - `Product categories`, `Stock locations`, `Retail settings` (default VAT rate, low-stock email recipients, allow negative stock y/n) — per the settings-first rule.
6. **Reports hooks (light)**
   - Two summary tiles for later Phase 11 reports: sales-by-day and low-stock count. No dedicated report page yet.

### Data model

New tables (all tenant-scoped, with GRANTs + RLS via `user_has_tenant_access`):
- `products` (id, tenant_id, name, sku, barcode, category_id, unit, cost_price, sell_price, vat_rate, reorder_level, active, sort_order)
- `product_categories` (id, tenant_id, name, sort_order, active)
- `stock_locations` (id, tenant_id, name, is_default, active) — seed one default per tenant
- `stock_movements` (id, tenant_id, product_id, location_id, qty_delta, reason enum: `receive|sale|adjustment|wastage|return`, ref_type, ref_id, notes, created_by, created_at)
- `retail_settings` (tenant_id PK, default_vat_rate, allow_negative_stock, low_stock_notify_emails)
- Extend `invoice_items` (already exists) with optional `product_id` + `stock_movement_id` so retail lines link back to catalogue + ledger.

Current on-hand is a view: `sum(qty_delta) group by product_id, location_id` — no denormalised counter to drift.

### Files (planned)

- `src/features/shop/ProductsPage.tsx`, `ProductFormModal.tsx`
- `src/features/shop/StockPage.tsx`, `StockAdjustmentDrawer.tsx`
- `src/features/shop/QuickSalePage.tsx`, `SaleCart.tsx`
- `src/features/shop/queries.ts` (products, stock on-hand, movements, quick-sale mutation)
- `src/features/settings/ProductCategoriesPage.tsx`, `StockLocationsPage.tsx`, `RetailSettingsPage.tsx` (+ index entries)
- `src/features/bookings/BookingInvoicePanel.tsx` — add "Add product" action
- Migration: tables above + on-hand view + RLS + GRANTs + seed default location

### Out of scope (deferred)

- Barcode scanner hardware integration (browser camera scan can come later).
- Purchase orders / supplier management.
- Multi-location transfers UI (schema supports it; UI later).
- Customer-portal shop (retail is operator-only for now).
- Real payment gateway (still Phase 12).

### Verification

- Create a product, receive 10 units → stock page shows 10 on hand.
- Quick sale of 3 units to a walk-in → invoice created, paid via existing flow, stock now 7, movement row with reason `sale`.
- Add a bag of food to an existing grooming booking → line appears on that invoice, stock decrements.
- Set reorder level 5 → product shows "Low stock" chip once qty ≤ 5.
- Customer A (portal) has no access to any retail table (RLS).

## Alternatives if you'd rather jump elsewhere

- **Phase 11 — Reports**: dashboards for revenue, occupancy, groomer utilisation, comms delivery, aged debtors. Needs real data first, so usually goes after Retail.
- **Phase 12 — Users & Roles**: staff accounts, per-role permission gates on the operator UI (owner/manager/groomer/driver/reception). Good to do before real go-live.
- **Phase 8c — Two-way messaging**: inbound WhatsApp/email replies threaded onto the customer.
- **Payment gateway**: wire PayFast/Yoco/Stripe into "Pay now" on invoices + portal.

Shall I proceed with **Phase 10 — Retail / Shop & Stock** as above, or pick one of the alternatives?
