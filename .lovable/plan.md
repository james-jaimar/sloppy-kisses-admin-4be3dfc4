## Fix event card sizing so a 1-hour booking fits its row

A 60-minute slot is 56px tall minus a 4px gap = 52px of usable card. The current card packs four lines (time+icons, pet, customer, resource) plus `py-1` (8px) padding, needing ~63px — so the last line clips.

### Changes (all in `src/features/calendar/CalendarWeekView.tsx`, `EventCard`)

- Reduce vertical padding: `py-1` → `py-0.5`.
- Tighten typography: header row stays `text-[11px]`; pet name `text-[11px]`; customer & resource drop to `text-[10px]`.
- Explicit `leading-[1.15]` on all text lines instead of relying on default line-height.
- In the resource-day view, hide the resource sub-line (the column header already names the resource) — accept a `hideResource` prop from `ResourceDayView`.
- If height < 46px (i.e. <50-min booking), hide the customer & resource lines to prevent clipping; keep time + pet only.
- Cap `EventCard` content with `overflow-hidden` (already there) and add `min-h-0` on flex children as needed.

Result for the 09:00–10:00 example: 3 lines × ~13px + 4px padding ≈ 43px, well within 52px.

### Out of scope

- No changes to the now-line, filters, status icons, or data. Purely CSS/layout inside `EventCard`.
