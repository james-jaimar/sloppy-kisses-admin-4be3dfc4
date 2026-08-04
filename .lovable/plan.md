# Xero go-live reconciliation toolkit

Goal: at go-live, start with clean billing data, then reconcile our 4,086 customers against Charlotte's existing Xero contact base so both systems agree before a single invoice is pushed.

## The three-way picture

```text
Matched      Xero contact <-> SK customer   -> link, push SK number to Xero
Xero-only    contact in Xero, not in SK     -> import as an SK customer, then link
SK-only      customer in SK, not in Xero    -> create the Xero contact (existing backfill)
```

## 1. Reconciliation report (new screen section)

On Settings -> Xero customers, a summary panel across the whole contact base:

- Total Xero contacts pulled, total active SK customers.
- Matched on account number / matched on email / matched on name or phone (needs review).
- Xero-only count, SK-only count.
- Exported to CSV so this can be sent to Charlotte before anything is changed.

Read-only. Nothing is written until you press a button.

## 2. Import Xero-only contacts into SK

A new "Xero only" tab listing contacts with no SK match:

- Bulk "Import selected as customers" creates SK customers from the Xero contact (name, email, phone, address), assigns the next SK customer number, links the Xero contact id, and pushes that new SK number back to Xero as the account number.
- Duplicate guard: an import is blocked if the email already exists on an SK customer — that row is re-matched instead of duplicated.
- Contacts with no email get imported with a flag so they're easy to find and complete later.
- Per-row "Ignore" so junk or archived contacts can be parked out of the way permanently.

## 3. Email as the working identifier

Matching order stays: account number, then email, then name or phone (review only). Because Charlotte's Xero mostly has no SK numbers, email will carry the bulk of the match — the report will show exactly how much of the base that covers before you commit.

## 4. Go-live clean slate (guarded action)

A "Prepare for go-live" action on the Xero settings page, behind a typed confirmation:

- Deletes all invoices, invoice items, invoice events, payments, allocations, refunds, credit notes and estimates for the tenant.
- Clears the Xero sync queue, sync log and contact staging.
- Clears every `xero_customer_id` on customers so matching starts fresh against the real Xero org.
- Leaves customers, pets, bookings, enrolments and attendance untouched.
- Writes one audit row recording who ran it and the row counts removed.

## 5. Go-live runbook (shown on the page)

1. Switch the Xero connection to Charlotte's live org, sync off.
2. Run "Prepare for go-live".
3. Pull contacts, auto-match, read the reconciliation report.
4. Confirm the safe links (account number / email), review the name and phone matches.
5. Import the Xero-only contacts.
6. Push the SK-only customers so Xero has the full base.
7. Turn sync on. From then on, new invoices push automatically on issue and a brand-new customer is the only case costing an extra Xero call.

## Technical notes

- `xero_contacts_staging` gains `ignored` handling via its existing `match_state` (new values `ignored`, `imported`); one migration for the reconciliation counts view.
- New `xero-sync` actions: `reconcile_report`, `import_contacts`, `ignore_contacts`, `reset_billing`. All resumable in chunks with the existing wall-clock budget, so nothing times out on 4k rows.
- `reset_billing` runs as a single security-definer SQL function scoped to the caller's tenant, gated by `settings.xero.manage`, so deletes happen in one transaction and can't half-complete.
- Import uses `next_customer_number` for SK numbers and respects the existing `customers_tenant_email_unique` index.
- Frontend: new report panel and "Xero only" tab in `XeroCustomersPage.tsx`, danger-zone card in `XeroSettingsPage.tsx`.
