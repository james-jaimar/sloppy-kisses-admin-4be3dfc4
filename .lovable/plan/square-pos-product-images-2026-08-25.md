# Square POS product images

## What

Ensure every product tile in the POS grid uses a true square image placeholder, with the product photo scaled proportionally inside (no cropping, no stretching). This makes the product grid tidy and rows line up.

## Where

- `src/features/pos/PosProductGrid.tsx` — product tile image container

## Current state

The tile already uses `aspect-square` and `object-contain`, but the live preview still shows long images. The square frame may be collapsing because the flex column parent lets the image box grow, or the image is not constrained correctly.

## Changes

1. Make the image box absolutely square and prevent it from stretching:
   - Keep `aspect-square` and `w-full`.
   - Add `shrink-0` and `min-h-0` to the image wrapper.
   - Ensure the `<img>` is `max-h-full max-w-full` while using `object-contain` so the image never breaks the square frame.

2. Keep the initials fallback centred in the same square box.

3. Maintain the stock badge in the top-left corner.

## Verification

- Open `/admin/pos` in the preview.
- Confirm every product tile image area is square.
- Confirm long/thin images (e.g. treat strips) are scaled to fit inside without cropping or distortion.
- Confirm short rows still line up uniformly.
