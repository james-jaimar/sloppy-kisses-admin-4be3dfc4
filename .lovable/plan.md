# Xero account pickers: sales codes + bank account list

## What I found (verified against your Xero org)

I pulled the live chart of accounts from "Sloppy Kisses Demo":

- Revenue accounts **do** exist: `200 Sales`, `260 Other Revenue`, `270 Interest Income`.
- There is **no bank account at all** in the org (no account of type BANK). The only three accounts flagged "payments enabled" are `880 Owner A Drawings`, `881 Owner A Funds Introduced`, `970 Owner A Share Capital` — which is exactly why those three are the only options in the bank dropdown. That list is technically correct; the org just has no bank account set up yet.
- The Sales/service account fields on the Xero settings page are plain free-text boxes, so they never offer `200 — Sales` as a choice. That is the "not giving me the standard codes" symptom.

## What I will build

1. **Sales account dropdowns**
   - Extend the Xero sync function with an accounts action that returns revenue/income accounts (code, name, type) alongside the existing bank list.
   - Replace the "Default sales account" text box with a dropdown of revenue accounts (e.g. `200 — Sales`), defaulting to 200.
   - Replace each per-service account override box (daycare, hotel, grooming, transport, retail) with the same dropdown, with a "Use default" empty option.
   - Keep a free-text fallback if the account list can't load, and always preserve a saved code that isn't in the list.

2. **Better bank account picker**
   - Group the options: real bank accounts first, then "Other payment-enabled accounts" (880/881/970) so it's obvious they aren't bank accounts.
   - When no bank account exists, show a clear note: create a bank account in Xero (Accounting → Chart of accounts → Add bank account), then hit Refresh — plus a Refresh button so you don't have to reload the page.

3. **Guidance for the current org**
   - Because there is no bank account, PayFast payments have nothing valid to post to. Either add a bank account in Xero (recommended, even a dummy "PayFast Clearing" bank account for testing) or temporarily map PayFast to one of the payment-enabled accounts to prove the flow.

## Technical notes

- `supabase/functions/xero-sync/index.ts`: generalise the `bank_accounts` action into an `accounts` action returning all ACTIVE accounts with `code`, `name`, `type`, `class`, `enablePayments`, `bankAccountType`; keep `bank_accounts` working for compatibility.
- `src/features/xero/XeroSettingsPage.tsx` + its hooks file: add `useXeroAccounts` (cached), derive revenue list (`class === "REVENUE"`) and bank list (`type === "BANK"` first, then `enablePayments`).
- No schema changes: `xero_settings.default_sales_account`, `service_account_codes` and `payment_accounts` already store codes as strings.
