## Goal
Make the staff home launcher feel more "Apple/iOS" — softer, more tactile tiles — plus fix the cramped edges and the greeting name. Grooming board stays as-is (you said it's fine).

## 1. Page padding / breathing room
`AdminLayout` renders `<Outlet />` with no padding, so `HomePage` sits flush against the sidebar and the top of the viewport.

- Wrap the `Outlet` in a `<main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">`.
- Check the department/board pages that already add their own padding and strip the duplicate so nothing gains double margins (grooming, hotel, daycare, vans, transport, bookings, invoices, dashboard, settings). Only the ones that visibly double up get touched.

## 2. Greeting
`HomePage` currently does `full_name.split(" ")[0]` → "Hi Front". Use the full name (`profile.full_name`), falling back to the first name only if no surname exists, then "there".

## 3. iOS-flavoured tiles
Applied inside `HomePage` + a couple of tokens in `src/index.css` — no new libraries.

- **Shape**: bump tile radius to iOS-continuous feel (`rounded-[22px]`), icon chips to `rounded-[18px]`.
- **Surface**: replace the flat card shadow with a two-layer soft shadow (tight 1px hairline + wide diffuse) and a very subtle top-to-bottom gradient on the tile so it reads as a raised control rather than a flat box.
- **Press feedback**: `active:scale-[0.97]` with a short spring-ish transition (`transition-transform duration-150 ease-out`), hover lifts slightly less than now so it feels less "web card".
- **Typography**: tighter label tracking, slightly heavier count numerals, `tabular-nums` retained.
- **Accent chips**: keep the existing tone palette, add a soft inner highlight so the icon squares look like iOS app icons.
- **Focus ring**: proper `focus-visible` ring using `--ring` for keyboard/tablet accessibility.

New reusable tokens in `index.css`: `--shadow-ios`, `--shadow-ios-hover`, and a `.sk-tile` component class so other screens can adopt the same look later.

## 4. Responsive check
Verify the tile grid at 1280 / 1024 / 768 / 390 px with a browser pass and screenshot, confirming padding and tap targets hold up on tablet.

## Out of scope
- Grooming board layout (leaving as the current column/stacked view).
- Any data, permission or query changes.

## Technical notes
All changes are presentational: `src/components/layout/AdminLayout.tsx`, `src/features/home/HomePage.tsx`, `src/index.css`, plus padding cleanup in any page that ends up doubled.
