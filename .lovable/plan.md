## Goal

Give the Home launcher tiles real iOS-style depth: frosted glass surface, crisp inner white edge, layered ambient shadow, and springier press/hover — without changing content, grid, palette, or typography.

## Changes

**1. `src/index.css` — rework `.sk-tile` and `.sk-tile-icon`**

- `.sk-tile`
  - Translucent surface: `hsl(var(--sk-surface) / 0.72)` plus `backdrop-filter: blur(14px) saturate(1.4)`, brightening to ~0.92 opacity on hover.
  - Replace the flat border with a layered box-shadow stack (no visible 1px grey border):
    - `inset 0 0 0 1px hsl(0 0% 100% / 0.85)` — bright glass rim
    - `inset 0 1px 0 hsl(0 0% 100% / 0.9)` — top light catch
    - `inset 0 -1px 0 hsl(25 10% 20% / 0.05)` — bottom shade so the tile reads domed
    - `0 1px 2px hsl(25 10% 20% / 0.05)`, `0 6px 16px -6px hsl(25 10% 20% / 0.12)` — contact + ambient
  - Hover: lift `translateY(-3px)` and swap ambient for `0 20px 40px -12px hsl(25 10% 20% / 0.16)`.
  - Press: `scale(0.975)` with the shadow collapsing to the contact layer, using a spring easing `cubic-bezier(0.34, 1.56, 0.64, 1)` on transform and 300ms ease on shadow.
  - Add a faint top-down sheen via a `::before` overlay (`linear-gradient(180deg, white/55%, transparent 45%)`, `pointer-events-none`, inherits the 22px radius) so the surface looks glass rather than paint.
  - Keep the existing focus-visible ring.
- `.sk-tile-icon`
  - Squircle-ish `rounded-[16px]`, add `ring`-style inner tint + inner shadow: `inset 0 1px 0 hsl(0 0% 100% / 0.75)`, `inset 0 -1px 2px hsl(25 10% 20% / 0.06)`, `0 1px 2px hsl(25 10% 20% / 0.08)` so the chip sits in a shallow well.
- Add `@media (prefers-reduced-motion: reduce)` to drop the transforms.

**2. `src/features/home/HomePage.tsx` — minimal touch-ups only**

- Remove the hardcoded `border-border/70` reliance now that the rim comes from the shadow stack (class list on the tile stays otherwise identical).
- No changes to tiles data, counts, hints, or the alert pill.

## Notes

- All new values are tokenised in `index.css` (new `--shadow-tile*` variables); components keep using `.sk-tile` / `.sk-tile-icon`, so no hardcoded colours land in TSX.
- Because the tile is translucent, the warm `--sk-bg` shows through slightly — that's what sells the glass. Contrast for label/hint text is unaffected.
- Same classes are used only on the Home launcher, so nothing else in the app shifts.
