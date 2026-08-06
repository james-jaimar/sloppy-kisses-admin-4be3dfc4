# Portal doesn't offer PayFast on an invoice

## What I confirmed

- PayFast **is** enabled for the tenant: `payment_providers` has a `payfast` row with `enabled = true`, mode `test`.
- The customer portal invoice page (`MyInvoiceDetailPage.tsx`) decides whether to show the "Continue to PayFast" button by querying the `payment_providers` table directly from the browser.
- That table's read policy is admin-only: `pp_select` requires `is_platform_owner()` or the `settings.payment_providers.manage` permission. A signed-in customer matches neither, so the query returns nothing, the flag reads false, and the page falls back to "Online payment isn't enabled yet."
- The public invoice link is unaffected — it goes through the `get_public_invoice` security-definer function, which returns `payfast_enabled` correctly. So the same invoice is payable from the emailed link but not from the portal.

This is a read-permission gap, not a PayFast configuration problem.

## Plan

1. Add a security-definer function `public.portal_payment_options(p_invoice_id uuid)` returning only what the portal needs: whether an online gateway is enabled and its mode. It verifies the caller's linked customer owns the invoice before answering, and exposes no merchant keys or passphrase. Execute granted to `authenticated` only.
2. Change `MyInvoiceDetailPage.tsx` to call that function instead of selecting from `payment_providers`.
3. Sweep the other portal screens for the same direct-table read (portal invoice list, booking payment prompts) and point them at the same function.
4. Verify with a signed-in portal session on the invoice Front Desk created: the PayFast button appears, the checkout redirect builds, and a `payment_attempts` row is written.

## Technical notes

- No change to the `pp_select` policy — keeping merchant credentials admin-only is correct; the function is the narrow read path.
- The function returns `{ payfast_enabled boolean, mode text }` and nothing from `settings`.