## Problem

Auto-matching is too loose — some rows land in the green "auto" bucket with the wrong customer, and today the only ways to correct a row are **Create new** or **Pick a pet** (a narrow scoped picker). You want a third option: **search the full customer database** and pick any customer/pet manually.

## Plan

All changes in `src/features/settings/DaycareImportPage.tsx` (plus a small helper). No schema changes, no touching commit logic.

### 1. Tighten auto-match

Raise the bar so weak matches drop into **Review** instead of **Auto**:

- **Auto** requires either:
  - a **mobile match** (last 9 digits equal) — near-certain, OR
  - **owner surname + owner first name both exact** AND dog first name equal/prefix match.
- Everything else with any score → **Review** (yellow).
- Kill the current substring-based owner scoring (`ownerFull.includes(ownLast)`) — that's the main source of Charlotte's noisy matches, because her original sheet stuffed dog names and breeds into the owner field.
- Keep the ranked candidate list for the Review picker.

### 2. New "Choose from customer database" action per row

Add a third button on every row, next to **Create new** and **Pick pet**:

**Search customer database** — opens a modal with:
- A search box (debounced) that filters ALL tenant pets+owners by owner name, mobile, or pet name (uses the already-loaded `useTenantPetsWithOwners` list — no new query).
- Pre-seeded with the seed row's owner name so results appear immediately.
- Results show: owner full name, mobile, and each of their pets (dog name + breed).
- Clicking a pet sets `matched_pet_id` + `matched_customer_id` on the row and marks it **confirmed** (green).
- Cancel leaves the row unchanged.

The modal uses the existing `ModalShell` (Escape / Cancel / pick-to-confirm; no backdrop close — per your earlier rule).

### 3. Row UI cleanup

- Show the seed row's owner + mobile + dog clearly on the left so you can eyeball the match.
- Show the currently matched customer + pet on the right, with a small "wrong?" hint when status is `auto` but score was borderline.
- Buttons on every row: **Confirm**, **Search customer database**, **Pick pet** (existing narrow list), **Create new**, **Skip**.

### 4. No changes to

- The commit step (enrolments, attendance, July invoices) — unchanged.
- The seed file — unchanged.
- Any DB schema, RLS, or edge functions.

## Result

After re-opening the importer, most rows will move from green to yellow (Review), and every row — including the ones the matcher got confidently wrong — will have a "Search customer database" button so you can pick the correct customer/pet from the full list before committing.