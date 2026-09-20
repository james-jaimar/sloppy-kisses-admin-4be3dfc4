# Xero-matching export for Charlotte

## Goal
Give Charlotte an Excel file she can take back into Xero: every customer and pet from our system, with our SK/SP numbers next to the original Xero naming, so she can add the SK column to her Xero data and keep the two systems in sync.

## What the data looks like (confirmed)
- 4,369 active customers, all with SK numbers (`customer_number`).
- 4,082 of them join back to the untouched July import, which holds the original Xero naming (e.g. `10210 M Annelie Badenhorst - JR X Sandy`).
- 226 live customer records also carry the Xero name directly; the September batch (290 customers) has no original Xero name stored — those rows match on name/email/mobile.
- 5,247 pets, all with SP numbers, each linked to their owner's SK number.

## Deliverable
One Excel file saved to Files, e.g. `sloppy-kisses-xero-match-export-2026-09-20.xlsx`, with three sheets:

**Sheet 1 — Customers**
| Column | Source |
|---|---|
| SK number | customers.customer_number |
| Original Xero name | raw import backup (or the live Xero field) |
| First name, Last name | live record |
| Email, Mobile, Alt phone | live record |
| Address, Suburb, City, Postcode | live record |
| Import batch | which import the customer came from |

**Sheet 2 — Pets**
SP number, pet name, species, breed, size, owner SK number, owner name.

**Sheet 3 — Summary**
Counts per sheet and how many customers had an original Xero name vs not, so Charlotte can see the coverage at a glance.

Formatting: plain, professional (Arial, header row bold), no formulas — a data file, not a model.

## Steps
1. Export customers joined to the raw backup for original Xero names (fall back to the live Xero field, then blank).
2. Export pets joined to their owners.
3. Build the workbook in /tmp, verify row counts against the database, then save to Files.
4. Hand over the file.

## Optional follow-up (not in this plan)
A built-in "Export for Xero" button in admin so you can regenerate this file yourself any time. Say the word and I'll plan that separately.

## Technical details
- Join: `customers.customer_number = import_customers_raw.customer_id`; fallback `customers.xero_customer_id`.
- No database changes; read-only export.
