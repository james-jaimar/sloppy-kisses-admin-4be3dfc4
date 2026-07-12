# PayFast integration — per-tenant, settings-driven

Sandbox-first. Refunds + online pay-now on invoices. All credentials live in `payment_providers.settings` (jsonb, per tenant) and are entered by Charlotte in Admin → Settings → Payment providers. No environment variables, no developer required to change providers.

## What Charlotte will see

**Admin → Settings → Payment providers → PayFast row → "Connect" button** opens a dialog with:
- Mode: Sandbox / Live (radio)
- Merchant ID
- Merchant Key
- Passphrase (masked, optional — PayFast allows blank)
- Return URL, Cancel URL, Notify URL — pre-filled and read-only (we tell her exactly which URL to paste into her PayFast dashboard's ITN settings)
- "Test connection" button — signs a dummy request and hits PayFast's ping endpoint to confirm creds resolve

Once saved and toggled Enabled:
- Invoice detail page: refund button routes to PayFast instead of writing manual rows
- Public invoice page: "Pay online" button appears, redirects to PayFast Checkout
- ITN webhook auto-records payments / updates refund status when PayFast calls back

## Where credentials live

`public.payment_providers.settings` jsonb, keyed per tenant per provider — already exists from C2. Shape for `provider = 'payfast'`:

```json
{
  "merchant_id": "10000100",
  "merchant_key": "46f0cd694581a",
  "passphrase": "…",
  "return_path": "/pay/success",
  "cancel_path": "/pay/cancel"
}
```

Reads gated by existing RLS (tenant owner / `settings.payment_providers.manage`). Passphrase is stored in plain jsonb — same trust boundary as merchant key. Never exposed to the browser except in the edit dialog for the tenant owner.

## Backend

1. **New migration** — small hardening only, no new tables:
   - Ensure `payment_providers` has a unique `(tenant_id, provider)` index (probably already there — verify).
   - Add `resolve_payfast_settings(target_tenant_id uuid)` security-definer function returning the settings jsonb for use inside edge functions via service-role reads (edge functions will use `admin.from('payment_providers')` directly, so this may not even be needed).

2. **Edge function `payment-gateway-refund`** — replace the 501 stub:
   - Load `payment_providers` row for the payment's tenant where `provider='payfast'` and `enabled=true`.
   - If not connected, return a clear "PayFast not configured for this tenant" error.
   - Build signed refund payload per PayFast spec, POST to `https://api.payfast.co.za/refunds` (sandbox base swapped when `mode='sandbox'`).
   - Insert `payment_refunds` row `status='pending'` with `provider_refund_id`, return id.

3. **New edge function `payment-gateway-checkout`** (D1 pay-now):
   - Input: `invoice_id`. Auth: public — only requires a valid invoice `public_view_token` (matches existing public invoice page auth model).
   - Loads the invoice + its tenant's PayFast settings.
   - Builds a signed PayFast Checkout redirect URL (m_payment_id = invoice id, amount = balance_due, item_name = invoice number, notify_url = our webhook, return/cancel = tenant-configured).
   - Returns `{ redirect_url }`.

4. **Edge function `payment-gateway-webhook`** — replace stub with real PayFast ITN handler:
   - Verify signature using the receiving tenant's passphrase (look up tenant by `m_payment_id` → invoice → tenant).
   - Verify source IP against PayFast's published range.
   - POST back to PayFast validate URL as spec requires.
   - If `payment_status = COMPLETE` and `m_payment_id` matches an invoice → insert `payments` row (dedup on `pf_payment_id`).
   - If `payment_status = COMPLETE` and payload matches a pending refund → flip `payment_refunds.status = 'succeeded'`.
   - All money math + invoice status flips happen automatically via existing triggers.

## Frontend

1. **`PaymentProvidersPage`** — replace the placeholder Enable toggle for PayFast with:
   - "Connect" button → opens `PayFastConnectDialog`.
   - Once connected: shows masked merchant ID + "Edit" and "Disconnect" buttons.
   - Enable/Disable toggle only usable after connect.

2. **`PayFastConnectDialog`** — new component:
   - Form with the fields above, zod-validated.
   - Copy-to-clipboard for the ITN URL to paste into PayFast dashboard.
   - Save → upsert `payment_providers` row via existing `useUpsertPaymentProvider` mutation (extend to accept `settings`).
   - "Test connection" button calls a tiny edge function endpoint that resolves the row and returns "OK" if creds parse.

3. **Public invoice page (`PublicInvoicePage`)** — add "Pay online with PayFast" button visible when the invoice's tenant has PayFast enabled and `balance_due > 0`. Button calls `payment-gateway-checkout` and `window.location = redirect_url`.

4. **Return/Cancel pages** — two tiny public routes (`/pay/success/:token`, `/pay/cancel/:token`) that show "Thanks, we're confirming your payment" and "Cancelled". Actual state comes from ITN, not the return URL.

## Sequenced work

1. Migration (small — unique index verify, nothing else if index exists).
2. Extend `useUpsertPaymentProvider` to take `settings`.
3. `PayFastConnectDialog` + refreshed `PaymentProvidersPage`.
4. Fill in `payment-gateway-refund` with real PayFast call.
5. New `payment-gateway-checkout` function + "Pay online" button on public invoice + return/cancel pages.
6. Real signature verification + ITN handling in `payment-gateway-webhook`.
7. Manual end-to-end test in Sandbox with Charlotte's sandbox merchant creds.

## Out of scope

- Yoco / Stripe (same pattern will apply later; not built now).
- Refund of gateway payments captured before PayFast was connected — those stay on the manual refund path (unchanged).
- Saving cards / tokenised repeat charges — not needed for one-off invoice payment.

Say the word and I'll start with the migration + Settings dialog so Charlotte can enter her sandbox creds first, then I'll wire the three edge functions.
