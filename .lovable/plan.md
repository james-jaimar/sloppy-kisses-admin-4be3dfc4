## Problem

The booking detail side panel (`BookingDetailPanel`) uses `z-40` for its backdrop and `z-50` for the panel itself. When "Edit" is clicked, `BookingFormModal` opens via `ModalShell`, which also uses `z-40`. Result: the edit modal renders behind the side panel.

## Fix

Bump `ModalShell`'s root overlay from `z-40` to `z-[60]` so any modal always layers above side panels/drawers (which top out at `z-50`). The panel and its backdrop stay visible behind the modal's own dimmed backdrop, which is the standard stacking approach.

### Change

- `src/components/modals/ModalShell.tsx`: change the outer overlay `div`'s `z-40` → `z-[60]`.

That's the entire change — one class swap. No component API changes, no behavioral changes to the side panel or modal contents.
