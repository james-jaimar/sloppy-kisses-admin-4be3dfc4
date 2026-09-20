# Export customers & pets for Xero matching

## Goal
Give the front desk a button in the app that downloads the full customer and pet list — including our SK/SP numbers next to the original Xero naming — so Charlotte can paste the SK column back against her Xero data and bring the two systems in line.

## What we confirmed
- 4,369 active customers, every one with an SK number.
- 4,082 of them can be traced back to the untouched July import, which still holds the original Xero naming (e.g. `10210 M Annelie Badenhorst - JR X Sandy`).
- 226 live records also carry a Xero name directly; the September batch has no original Xero name — those match on name, email and mobile.
- 5,247 pets, all with SP numbers, each linked to their owner's SK number.

## What gets built

**A new "Data export" page under Reports** (`/admin/reports/export`), with a card on the Reports index.

On the page:
- A short explanation of what the export is for.
- Two buttons: **Download customers** and **Download pets**.
- A third button: **Download both (one file per list)**.
- Row counts shown before download so the user knows what they're getting.
- A checkbox: "Only active customers" (on by default).

Files download as CSV, which opens straight in Excel and imports cleanly into Xero.

**Customers file columns**
SK number, Original Xero name, First name, Last name, Full name, Email, Mobile, Alt phone, Address line 1, Address line 2, Suburb, City, Province, Postcode, Status, Number of pets, Date added.

**Pets file columns**
SP number, Pet name, Species, Breed, Size, Date of birth, Owner SK number, Owner name, Owner email, Owner mobile.

Access is limited to staff who already have reports access, same as the other reports.

## Technical details
- The original-Xero-name backup tables (`import_customers_raw`, `import_pets_raw`) have row-level security on with no policies, so the browser cannot read them directly. Add two SECURITY DEFINER functions, `export_customers_for_xero(p_tenant_id, p_active_only)` and `export_pets_for_xero(p_tenant_id)`, that do the join server-side and check `public.user_has_permission(p_tenant_id, 'reports.view')` before returning rows. Grant execute to `authenticated` only.
- Original name resolves as: raw import backup → `customers.xero_customer_id` → blank.
- Frontend: `src/features/reports/DataExportPage.tsx` plus query hooks in `src/features/reports/queries.ts`, following the existing CSV pattern in `RevenueReportPage.tsx` (build CSV string, Blob, anchor download). Route added in `App.tsx` under the existing `reports.view` permission guard, and a card added to `ReportsIndexPage.tsx`.
- Read-only: no customer or pet data is changed.

## Not in this step
Full two-way Xero sync stays on the later roadmap; this is the manual export bridge for go-live.
