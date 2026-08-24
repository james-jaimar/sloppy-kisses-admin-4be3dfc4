# Till clean-up: shop-only login, sticky pay panel, square product images

## 1. Why the pay button ended up 700 products down

`AdminLayout` wraps every admin page in `min-h-screen` with no height cap and no `overflow-hidden`. The till page asks for `flex-1 min-h-0 overflow-hidden`, but with an uncapped parent that means "grow as tall as the products", so the whole page scrolls and the cart column — Charge / Cash / Card / Park / Clear — is pushed to the bottom of a very tall page. Paging is working (the screenshot shows "Page 1 of 30"); it was only the page height that made it look like all 717 items were listed.

Fix: give the till a true viewport-height shell so only the product grid and the sale list scroll internally.

- The till renders in a full-height frame (header + banner accounted for), the products column scrolls on its own, and the sale column scrolls on its own.
- The totals block and Charge / Cash / Card / Park sale / Clear buttons are pinned to the bottom of the visible sale column at every width, tablet included.
- On tablet portrait (stacked layout) the sale panel keeps a fixed share of the screen with its own scroll, so the buttons stay reachable without scrolling the page.

## 2. Sale-line images are broken

The sale panel renders `product.image_url` straight into an `<img>`. That field holds a private storage path, not a URL, so every thumbnail 404s. Product photos work in the grid because the grid resolves paths to signed URLs first. The sale panel will use the same resolver, and fall back to the product initials when there is no photo.

## 3. Square product images

Every product tile gets a fixed square image area with the photo scaled to fit inside it (no cropping, no stretching). Tall/thin bottles show small and centred; wide bags fill the width. Tiles become uniform height, so rows line up down the page. Same square treatment for the small thumbnail on each sale line.

## 4. Dumb down the shop login

Today the shop user sees Home, Dashboard, Customers and Quotes in the sidebar because the Shop Staff role was seeded with `customers.view` and `invoices.view`, and Home/Dashboard are ungated.

Shop Staff keeps only:

- Run the till and take payment
- Browse the product catalogue and product photos
- See stock levels
- Link a scanned barcode to a product — only while admin leaves that switch on

Removed from the role: customer records, quotes/invoices, dashboard, home launcher. Sidebar shows Shop & Stock only, and login lands straight on the till. Home and Dashboard become gated so a till-only user never sees them. Everything stays editable in Admin → Users & roles, so you can hand a permission back at any time.

The Shop & Stock hub for a till user shows: Point of sale, Quick sale, Products, Stock levels, Photo studio — and Unknown barcodes only when they hold the barcode permission.

## Technical notes

- `AdminLayout`: `min-h-screen` stays for normal pages; the till gets a height-constrained wrapper (`h-[100dvh]` shell with `overflow-hidden`) so its internal `min-h-0` flex chain works. Implemented without changing other admin pages' scroll behaviour.
- `PosSalePanel.tsx`: use `useProductImageUrls` for line thumbnails; footer block becomes `sticky bottom-0` inside the panel's scroll container, with the Park/Clear row moved into the same pinned footer.
- `PosProductGrid.tsx`: image box `aspect-square` with `object-contain` on a muted background instead of `aspect-[4/3] object-cover`.
- Migration: trim `role_permissions` for `staff_shop` to `pos.operate`, `products.view`, `products.photos`, `stock.view`, `pos.barcode.link`.
- `navigation.ts`: add `code` to Home and Dashboard entries so till-only users don't see them; keep them visible for every existing role.
- No change to the sale, invoice or stock pipeline.
