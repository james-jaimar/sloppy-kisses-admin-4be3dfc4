# PayFast: find out why the sandbox payment never landed

## What I checked (facts, not guesses)

- `payments` table: **zero rows** — no online payment has ever been recorded, so nothing was applied to an invoice.
- Edge function logs for `payment-gateway-webhook` and `portal-invoice-checkout`: **empty** (retention has rolled past yesterday), so I cannot see what PayFast sent.
- The ITN endpoint **is publicly reachable** — a dummy POST returned a normal `404 invoice_not_found`, so it is not blocked by auth.
- PayFast settings saved for the tenant: sandbox mode, merchant `10052458`, passphrase set, notify URL on the Supabase functions endpoint, return URL `https://sloppykisses.jaimar.dev/pay/success`.
- The success page (`PayResultPages.tsx`) is a **static "thanks" screen** — it does not know which invoice was paid and never refreshes or polls. That alone explains "it brought me back and nothing updated on screen".

## What I cannot confirm yet

Why the ITN did not produce a payment row. The webhook rejects silently (returns 400/403, writes nothing) on any of: signature mismatch against the sandbox passphrase, PayFast's `validate` callback not returning `VALID`, or the sandbox never firing the ITN. With logs expired there is no trace. **Step 1 makes that traceable, then we re-run one sandbox payment.**

## Plan

### 1. Make every ITN visible (the real gap)
- New table `payment_webhook_events`: raw body, provider, resolved invoice, outcome (`accepted` / `bad_signature` / `not_validated` / `dedup` / `error`), error text, timestamp. Admin-read only.
- Webhook writes a row **before** any validation and updates the outcome on exit, so a rejected ITN is no longer invisible.
- New screen: **Settings → Payments → Gateway activity**, listing recent ITNs with status, amount, invoice and expandable raw payload, plus a "Retry processing" action for fixable failures.

### 2. Track the checkout attempt
- New table `payment_attempts`: invoice, customer, amount, mode, status (`redirected` / `completed` / `abandoned`).
- Both checkout functions insert an attempt, pass its id as `custom_str3`, and append `?att=<id>` to the return URL — so a payment that goes to PayFast and never comes back is still visible to staff.

### 3. Fix the return experience
- `/pay/success?att=…` becomes live: shows invoice number and amount, polls up to ~60 seconds for the matching payment, then shows either "Payment confirmed" with the new balance or "No confirmation from PayFast yet" with what to do next.
- Portal invoice detail refreshes invoice and payments on return so the customer sees the paid state without reloading.

### 4. Harden the webhook
- Log computed vs received signature instead of failing silently.
- In **test** mode, treat a failed `validate` callback as a warning and still record the payment (sandbox's validate endpoint is unreliable); keep it mandatory in **live** mode.
- Keep dedupe on `pf_payment_id`.

### 5. A self-test so this is provable
- Settings → Payment providers gets a **"Send test ITN"** button that posts a signed, self-generated ITN for a chosen unpaid invoice through the real webhook and shows the outcome. Confirms creds, signature and invoice application end to end without involving PayFast.
- After the code lands, I will walk the sandbox payment path once and report exactly which step passes or fails.

## Notes / decisions for you

- The notify URL exposes `…supabase.co`. It is a server-to-server call the customer never sees, and hiding it behind `sloppykisses.jaimar.dev` needs a proxy — I would leave it unless you want that added.
- Sandbox merchant `10052458` is PayFast's shared sandbox merchant. If a passphrase is set on our side but not on the sandbox account, every signature check fails — the activity log in step 1 will show that immediately.

## Technical summary

Two migrations (`payment_webhook_events`, `payment_attempts`, with grants and admin-only RLS), edits to `payment-gateway-webhook`, `payment-gateway-checkout` and `portal-invoice-checkout`, a new admin page under Settings → Payments, and a rewrite of `PayResultPages.tsx` with an invoice-polling hook.