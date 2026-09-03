# Xero customer/pet import — data review and import plan

## Verdict

Mostly clean, but not a straight paste-in. Structure is right (290 customers, 272 pets, 48 addresses, all foreign keys internally consistent), and the numbering continues correctly. There are six hard blockers that will make an unmodified import fail, plus a few quality issues worth fixing first.

## What checks out

- 290 customers `SK04409`–`SK04698`; live database max is `SK04408`, so numbering follows on with no gap or clash.
- 272 pets `SP5009`–`SP5280`; live max is `SP4982`, so no clash (small unused gap `SP4983`–`SP5008`).
- No duplicate customer numbers or pet numbers within the file.
- Every pet row and every address row points at a customer number that exists in the Customers sheet.
- Pet counts on the customer rows (272 total) match the Pets sheet exactly.
- 10 possible existing-customer matches were already parked in the Review sheet and excluded — that judgement looks sound.

## Blockers (must be resolved before import)

1. **6 emails already exist on live customers.** The database has a unique email index per tenant, so these rows will be rejected:
   - `courtleswolf@gmail.com` → existing SK02896
   - `mandierothmann@gmail.com` → existing SK03587
   - `nicci.hume@gmail.com` → existing SK01292
   - `vanessa.dosreis@gmail.com` → existing SK04340
   - `yvonne@starcargo.co.za` → existing SK04385
   - `zane@hartman.co.za` → existing SK04390
   These look like the same people, not new ones. Decision needed per row: attach the pets to the existing customer, or clear the email on the new record.

2. **5 duplicate email pairs inside the file itself** (same address on two new rows) — also unique-index failures:
   - SK04435 Bulelwa Madonsela / SK04436 Bulelwa Tetyana
   - SK04449 Chantal Rodda-Mini / SK04450 Chantell Radda-Mini
   - SK04471 "Dummy" / SK04472 Joan Richter
   - SK04562 Mandie Rothman / SK04563 "rothman"
   - SK04683 Vanessa Dos Reis / SK04684 Venessa Govender
   Four of the five read as the same person spelled twice; SK04683/SK04684 look like two different people sharing one email.

3. **Mobile numbers lost their leading zero** (stored as numbers in the spreadsheet). Live data is `0833060769` format. 216 numbers are 9 digits (need a `0` prefix), 7 are 10 digits (need checking — e.g. `8467807922` is not a valid SA number), 4 are 8 digits (unusable as-is).

4. **14 pets have species `unknown`**, which the database does not accept — species must be `dog`, `cat`, or `other`.

5. **A junk record**: SK04471 is literally named "Dummy" — should be dropped or merged into SK04472.

6. **Postcodes and phone-shaped fields arrive as numbers** (`2191.0`), so the import must cast to clean text, not paste raw values.

## Quality issues (import can proceed, but flagged)

- 16 customers have neither email nor mobile — no way to contact or invite them to the portal.
- 143 customers have no email (portal invite impossible until captured), 63 have no mobile.
- 75 pets carry a parsing warning in Behaviour notes ("Pet name not clear in Xero", "Breed-to-pet mapping needs review") — for example Adrian Friedman's five pets all share breed `Havanese; Cat` instead of per-pet breeds, and the cats are typed as unknown.
- No breed on the pets is validated against the breed list yet, and no pet sizes are set, so grooming pricing will need a size on first booking.
- Only 48 of 290 customers have an address; none are Google-verified, so mobile grooming/transport for these customers will flag until an address is verified.
- No Xero contact IDs in the file, so these customers will not be linked to Xero and will be created fresh on first push.
- One typo email: `marinus.pretorius@gmail.con` (should almost certainly be `.com`).

## Proposed import approach

1. **Decision pass** — I produce a short decision sheet listing the 6 live-email collisions and the 5 in-file duplicates, with a recommended action per row. You/Charlotte confirm merge vs keep.
2. **Staging load** — load the three sheets into staging tables (raw text, no constraints) so nothing touches live data yet.
3. **Normalisation** — restore leading zeros on mobiles, cast postcodes to text, map species `unknown` → `other`, trim names, lowercase emails, drop the "Dummy" row.
4. **Dry run** — a validation report: rows that would insert, rows that would be rejected and why. Reviewed before anything is written.
5. **Commit** — insert customers, then pets (linked by SK number), then addresses, in one transaction with `import_source = 'Xero customer cleanup 2026-09-03'` on every row so the whole batch can be identified or rolled back.
6. **Post-import check** — counts, spot-check five customers with pets in the app, and a list of the customers still missing contact details for follow-up.

## Technical notes

- Customers: unique index on `(tenant_id, lower(email))` is the failure point for blockers 1 and 2.
- Pets: `species` is the `pet_species` enum (`dog`, `cat`, `other`); `size` and `size_override` use `pet_size` and can stay null; `sex`/`sterilised_status` default to `unknown`, which matches the file.
- Addresses: `customer_addresses` has one-primary-per-customer enforcement; all 48 rows are primary for distinct customers, so that is safe. Google fields left null and verified later.
- All rows written with `tenant_id = 75cc6a9e-9d17-4268-92ee-8b595c842dee`.
- Import executed as SQL migrations against staging tables, not through the app UI.
