# Xero: sales account pickers + verify a live payment sync

## Where we are

- A bank account now exists in Xero and PayFast is mapped to it — that half is done.
- Still outstanding: the Sales / per-service account fields on the Xero settings page are plain free-text boxes, so they never offer the standard codes. Your org has `200 Sales`, `260 Other Revenue`, `270 Interest Income` available.
- No payment rows exist in the database yet, so the PayFast -> payment -> Xero chain has never actually run end to end.

## Step 1 — Sales account dropdowns (build now)

- Extend the Xero sync function with an `accounts` action returning all active accounts (code, name, type, class, payments-enabled), keeping the existing `bank_accounts` action working.
- Replace "Default sales account" with a dropdown of revenue accounts, e.g. `200 — Sales`, defaulting to 200.
- Replace each per-service override (daycare, hotel, grooming, transport, retail) with the same dropdown plus a "Use default" option.
- Keep a free-text fallback if the list can't load, and never drop a saved code that isn't in the list.
- Add a Refresh button next to the account lists so a change in Xero can be pulled without a page reload.

## Step 2 — Prove the payment chain (needs you)

Once Step 1 is in, pay the deposit on INV00243 from the portal in PayFast sandbox. I then verify and report back on:

1. `payment_attempts` row created at checkout.
2. PayFast ITN received and logged, `payments` row inserted with method `payfast`.
3. Invoice moves to `part_paid` with the correct balance.
4. Xero queue picks up the payment, posts it to the mapped bank account, and stores the Xero payment id — plus the invoice's amount due updates in Xero.

If any link fails I fix it there and re-run the check.

## Technical notes

- `supabase/functions/xero-sync/index.ts`: generalise `bank_accounts` into an `accounts` action; revenue list = `Class === "REVENUE"`, bank list = `Type === "BANK"` first then payments-enabled.
- `src/features/xero/XeroSettingsPage.tsx` and its hooks: add `useXeroAccounts` (cached) and reuse it for both pickers.
- No schema changes — `xero_settings.default_sales_account`, `service_account_codes` and `payment_accounts` already store codes as strings.
