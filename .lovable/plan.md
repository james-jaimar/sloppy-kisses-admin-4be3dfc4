# Load the 717-item shop stock into the POS

The spreadsheet maps cleanly onto the existing products table for the basics (name, prices, category, barcode, image), but it carries richer detail the database has no home for yet: brand, species, subcategory, pack size, variant label and variant families. The catalogue is currently empty, so this is a clean first load.

## What the data looks like

- 717 in-stock items, every Xero item code unique — a safe unique key.
- 19 categories, 79 subcategories, 40 brands (450 rows have no brand yet), species Dog / Cat / Dog & Cat / Unknown / Household / Bird.
- 73 variant families (e.g. NexGard Spectra across 9 sizes) covering 135 items; the rest are standalone.
- Every row has a sell price and a purchase price; no barcodes and no images yet.

## Decisions taken

- Prices are VAT-inclusive at 15%.
- The Xero item code becomes the SKU **and** is stored as the Xero reference, so nothing can drift before the sync is built. An internal SKU can be layered on later without touching the Xero link.
- Quantities load as opening stock so the till shows real levels from day one.
- Brands become a managed list with a Settings screen, not free text.

## Database changes

- **Categories get a parent** — one `product_categories` tree: 19 parents with their 79 subcategories underneath. POS chips show parents; the products list can filter to a subcategory.
- **New `product_brands` table** (name, active, sort) with tenant scoping, plus `products.brand_id`.
- **New product columns**: `species`, `size_pack`, `variant_label`, `parent_product_id` (self-reference for variant families), `sell_in_pos`, `notes`, `source_ref` (the original spreadsheet row for reconciliation).
- **Unique index** on Xero item code per tenant so re-running the import updates rather than duplicates.
- Prices stored as-is with `vat_rate` 15 and a tenant-level "prices include VAT" flag in Retail settings, so the till and invoices back VAT out correctly.

## The import

A one-off, re-runnable import that:

1. Creates the 19 parent categories and 79 subcategories.
2. Creates the 40 brands.
3. Inserts 717 products keyed on Xero item code — name from `pos_name`, sell/cost prices, category, brand, species, pack size, variant label, VAT 15%.
4. Links the 135 variant rows to their family parent (the first variant in each group acts as the family head, so nothing phantom is created).
5. Writes opening-stock movements at the default stock location for every item with quantity > 0.
6. Prints a reconciliation summary: rows in, products created, quantities loaded, anything skipped.

The 3 rows flagged "Needs Manual Review" still import — they land in an **Uncategorised** category so staff can fix them in the UI rather than losing stock.

## UI to match

- **Products list**: brand, species, category → subcategory columns; filters for category, subcategory, brand and species; search already covers name/SKU/barcode.
- **Product form**: brand picker, species, subcategory, pack size, variant label, and a **Scan barcode** field that accepts a scanner burst straight into the barcode box.
- **Product image upload**: drag/drop or camera capture on the product form, going through the existing S3 upload pipeline used for documents, with thumbnail preview and remove. The POS grid already renders `image_url`.
- **Bulk image mode**: a "Photograph products" screen listing items without an image, so staff can work through them on a tablet in one sitting.
- **Settings → Shop**: Brands CRUD and Categories CRUD (with parent/child), both permission-gated, per the settings-first rule.
- **POS grid**: category chips driven by parent categories; a brand filter row when a category is selected.

## Technical notes

- Migration: `product_categories.parent_id`, `product_brands` table with GRANTs + RLS mirroring `products`, new `products` columns, unique index on `(tenant_id, external_code)`.
- Import runs as SQL generated from the sheet (staging table → upsert), not a client-side loop, so it is atomic and repeatable.
- Image uploads reuse `documents-sign-upload` / `documents-upload` with a `product-images` prefix; public read URL stored in `products.image_url`.
- `useProducts` gains brand/species/subcategory filters; `Product` interface extended in `src/features/shop/queries.ts`.

## Build order

1. Migration (categories tree, brands, new product columns, unique key).
2. Import the 717 items + opening stock, with the reconciliation report.
3. Products list filters and the extended product form (brand, species, variant, barcode scan).
4. Image upload + bulk photograph screen.
5. Brands and Categories settings screens; POS chips/brand filter.
