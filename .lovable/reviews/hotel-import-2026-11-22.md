# Hotel go-live import — 22 November 2026

## Saved and verified

- Source: Charlotte's updated hotel workbook, `Hotel Bookings >`, current/future cutoff 22 November 2026.
- 123 of 125 stays saved; 181 pet links, 67 existing invoices, 117 original quotes.
- Existing invoice value: R511,024.22; settled: R445,228.47; outstanding: R65,795.75.
- Every imported customer, date, pet link, Xero invoice ID, invoice number and balance was compared with the prepared source manifest by fresh database readback.
- No import emails, pending Xero queue entries, new Xero invoices or Xero payment writes. Customer number updates only: Jacomien SK05151, Demi SK05152, Mushroom Productions SK05083 (padding of existing SK5083).
- Next app invoice remains INV-70001. Normal automatic invoicing and Xero invoice pushes remain enabled; payment syncing remains disabled.
- Historical receipt methods that Xero did not identify are `other`, with explicit provenance notes; no EFT/card method was guessed. Prior overpayments were retained as settled receipts, not cancellation credits.
- Existing spreadsheet dates were retained. Closed-date reservations have per-booking overrides and staff-review notes; normal closure settings were not changed.
- Original Xero quote prices survive staff confirmation. Already-invoiced stays retain their invoice links; known pre-billed grooms reuse that invoice, and ambiguous pet/groom billing associations require review before another charge.
- Source spreadsheet rows and original Xero documents are retained with the records. No intake checklist, signature or vaccination evidence was fabricated.
- Rebecca Jordan/Jordaan was confirmed as SK00495. Kitler belongs to separate company account SK05083, not Landy's personal account. The shared email is a company contact only; company primary-email/portal linking remains a follow-up.
- Bailey was linked to Michelle Eckert's existing profile using the exact Xero name; the newly imported `Baily` spelling duplicate was archived.

## Held, not silently modified

| Stay | Source | Reason |
| --- | --- | --- |
| Emile Govender — Loki | Row 581, QU-4808, INV-68436 | Invoice R8,340, R660 credit from historical CN-67162 (total R3,300), R7,680 due. The credit must be imported as credit-note allocation, not labelled as cash; remaining historical allocation carry-over needs a verified approach. |
| Sandra Naidoo — Scottie | Row 646, QU-4870, INV-68464 | Xero invoice remains R0, despite R645 on the spreadsheet quote; intended billing needs bookkeeper review. |

Both invoices were rechecked through James's Xero immediately before closing; neither was changed or recreated.

## Verification and limits

- 15 focused Vitest checks passed (tax interpretation, linked invoice handling, quote flow and payment rules).
- Three Deno payment-policy tests passed.
- Rollback-only database checks passed for original quote amount retention, repeat-confirmation idempotency and scheduling pre-billed grooming without another invoice or line.
- Import duplicate protection was exercised: the second batch inserted three new stays and skipped the first 118.
- One-off import endpoint and its service-only RPC were removed after use.
- Preview build log reported OK; no manual build was run.
- Authenticated staff-screen/end-to-end browser checks were unavailable in this external unmanaged Supabase session. No live customer acceptance or collection was exercised in the UI.
- Existing database security findings predate this request and were not changed by the import.