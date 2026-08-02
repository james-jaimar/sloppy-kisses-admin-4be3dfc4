## Goal

Add a reusable `SoftDashboardTile` component with a soft, tactile, tablet-friendly tile style, and use it for the Front Desk home launcher only. Nothing else in the app changes.

## Changes

**1. `src/index.css` — add a `soft-*` component layer**

Add the supplied classes under `@layer components`, with two adjustments so they respect the Sloppy Kisses design system:

- Neutrals (`slate-200/60`, `slate-950`, `slate-500`, `rgba(15,23,42,...)`) map to existing tokens: `border-border`, `text-foreground`, `text-muted-foreground`, and a shared `--shadow-soft-*` ink colour based on the warm `hsl(25 10% 20%)` already used for `--shadow-ios`.
- Icon/value tones (`emerald / rose / cyan / orange`) map to the SK palette: `sk-green-soft` + `sk-green`, `sk-coral-soft` + `sk-coral-dark`, `sk-turquoise-soft` + `sk-turquoise-dark`, `sk-orange-soft` + `sk-orange`. Glow values become `hsl(var(--sk-*-soft) / 0.9)`.

Everything else — 30px radius, three-layer ambient shadow + inset top highlight, radial corner sheen via `::before`, hover `translateY(-3px)`, active `translateY(-1px) scale(0.995)` with inset sunken shadow, 180ms transitions, `soft-icon-tile`, `soft-chevron`, title/subtitle/value type scale — stays exactly as specified. Adds a `prefers-reduced-motion` block to drop the transforms.

**2. New `src/components/ui/SoftDashboardTile.tsx`**

The component as specified (`title`, `subtitle`, `value`, `icon`, `tone`, `onClick`, `--tile-glow` inline var), plus:

- Optional `to?: string` — renders a react-router `Link` instead of a `button` when provided, since the home tiles are navigation, not actions. Keeps `onClick`/`button` support for reuse elsewhere.
- Optional `alert?: React.ReactNode` slot rendered under the subtitle, so the existing "N unpaid today" / "N unassigned" pill survives.
- Optional `loading?: boolean` to show the spinner in place of the value (current behaviour while stats load).
- `focus-visible` ring using `ring-ring`.

**3. `src/features/home/HomePage.tsx`**

- Replace the inline `<Link className="sk-tile ...">` markup with `<SoftDashboardTile ... />`, passing `to`, `label` → title, `hint` → subtitle, the count, the lucide icon, tone, and the attention pill as `alert`.
- Tone mapping unchanged (`coral | turquoise | green | orange` → `coral | cyan | green | orange`).
- Grid gets slightly larger gaps to suit the bigger 170px-min tiles; columns stay `2 / md:3 / xl:4`.
- No changes to tile data, permissions filtering, or the queries.

## Notes

- `.sk-tile` / `.sk-tile-icon` stay in `index.css` untouched for now — the Home page just stops using them. They can be removed once nothing references them.
- No new dependencies; no animation library.
- Tokenising the colours means the tiles keep the exact look described while staying themable and passing the project's "no hardcoded colour utilities" rule.
