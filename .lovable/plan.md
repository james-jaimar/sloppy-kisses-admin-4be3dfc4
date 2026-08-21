# Email layout fix + guidance on public invoice links

## Part 1 — The big empty gap at the top of the email

Unconfirmed diagnosis. The logo now loads, so the remaining problem is layout only, in the shared email shell used by every outbound email (`_shared/comms-transport.ts` → `renderBrandedHtml`). I have not yet inspected the exact HTML that Outlook received, so step 1 is to capture it rather than guess.

Likely suspects to confirm (all classic Word-engine behaviours):
- `border-radius` + `overflow:hidden` on the card table — Word ignores both and can mis-measure the table.
- The hidden preheader `<div style="display:none">` — Word does not honour `display:none` reliably and can reserve a block.
- Word paginating the message and pushing a block that crosses its internal page boundary, leaving a tall white band.
- The nested outer padding table (`padding:40px 12px`) without `cellpadding/cellspacing/border` resets and without an MSO ghost table.

### Steps
1. Reproduce: render the invoice email HTML exactly as the function produces it, save it, and read it end to end looking for the constructs above (no guessing from the screenshot alone).
2. Rebuild `renderBrandedHtml` on the standard, battle-tested Word-safe pattern:
   - single 600px centred table wrapped in an `<!--[if mso]>` ghost table;
   - `cellpadding="0" cellspacing="0" border="0" role="presentation"` on every table;
   - padding applied on `<td>` only, never on `<table>` or `<div>`;
   - drop `border-radius`/`overflow:hidden` from the structural table (keep a plain coloured header band, which Outlook renders correctly);
   - `mso-line-height-rule:exactly` and explicit `font-size`/`line-height` on every text cell;
   - preheader as the standard zero-height span technique, or removed entirely if it still misbehaves.
3. Keep the visual design identical to what you have now (coral band, logo, name, heading, body, divider, footer) — this is a markup-structure change, not a redesign.
4. Because the shell is shared, the fix lands at once for invoice, reminder, quote, notification, auth (invite/reset) and SMTP test emails.
5. Verify: send a real test through your SMTP and check in Outlook desktop plus one webmail client; confirm the body is visible without scrolling past a blank area.

## Part 2 — Should the invoice link be behind a login?

### What you have today
`/i/<token>` is an unguessable random UUID capability link. The page shows invoice number, amounts, line items, your company/banking details, and the customer's name, email, mobile and postal address. Drafts are blocked, the link never expires, cannot be revoked, and is the same link used for the PayFast checkout.

### Recommendation (this is the world standard)
Keep the tokenised public link — Stripe, Xero, QuickBooks, FreshBooks and Sage all send hosted invoice links that open without a login. Forcing a login before someone can pay measurably reduces and delays payment, and the recipient of the email is by definition the person entitled to see the invoice.

Harden it rather than gate it:

1. **Trim the data on the public page** — show name and invoice/billing address only. Remove the customer's email and mobile from the public payload (`get_public_invoice`); they are not needed to pay.
2. **Strong, rotatable token** — keep the UUID (or move to a 32-char random token) and add a "revoke / regenerate link" action on the invoice page so a mis-sent link can be killed.
3. **Optional expiry** — a setting such as "public links expire N days after the invoice is paid" (default: never expire while unpaid, expire 90 days after settlement).
4. **No indexing** — `noindex, nofollow` meta plus `robots.txt` disallow on `/i/`, and no invoice data in the URL path beyond the token.
5. **Rate limit + audit** — throttle token lookups to stop enumeration attempts, and keep logging views to `invoice_events` (already done).
6. **Login only for the archive** — the portal (behind login) stays the place to see full history, past invoices and statements; the emailed link stays one-invoice, view-and-pay only.

If you would rather be stricter, the middle option used by some banks/insurers is a **soft gate**: the link opens a page asking for one low-friction verifier (invoice number, or the last 4 digits of the mobile on file) before revealing detail. It cuts the risk of a forwarded link, at the cost of some payment friction. I would not recommend a full login gate.

### Steps for Part 2
Confirm which route you want. If you pick the recommendation, the work is: trim the RPC payload, add token revoke/regenerate on the invoice page, add `noindex` on the public route and `robots.txt`, and add the optional expiry setting under Settings → Invoicing.

## Technical notes
- Files touched in Part 1: `supabase/functions/_shared/comms-transport.ts` (shell markup), plus a verification send. No template content changes.
- Files touched in Part 2 (if approved): `get_public_invoice` migration, the public invoice page, `InvoiceDetailPage.tsx`, `public/robots.txt`, and an invoicing setting.
