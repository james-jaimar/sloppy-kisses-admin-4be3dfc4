# Quote email snags + a real "Accept this quote" flow

## 1. Fix the email rendering snags

**The stray `=20` lines.** The HTML is sent as quoted-printable, and any line in the template that contains only spaces becomes a literal `=20` in some clients. Fix by stripping trailing whitespace from every line of the generated HTML (and collapsing blank whitespace-only lines) before handing it to the mailer, in `_shared/quote-email.ts`.

**House guidelines showing raw markdown.** The tenant guidelines are stored as markdown (`## 1. What to Pack`, `**bold**`, `-` bullets) but are currently printed as escaped plain text. Add a small, safe markdown-to-HTML renderer in `_shared/quote-email.ts` (headings, bold, italics, bullet lists, paragraphs, links — escape everything else) and render the guidelines block as styled sections instead of one grey blob. The plain-text version keeps the raw markdown stripped of `**`/`##`.

## 2. "Accept this quote" goes somewhere real

Today the button links to `{app}/portal/quotes`, which does not exist.

**Public quote page, mirroring the existing public invoice link (`/i/:token`).**

- Add a `public_token` to `estimates` (generated on insert, backfilled for existing quotes).
- New read-only RPC `get_public_quote(token)` returning the quote, its line items, pets, dates, totals, deposit and hold date — no login required.
- New RPC `accept_public_quote(token)` that validates the token, checks the quote is still `sent` and inside its hold window, then calls the existing `accept_estimate` (which creates the booking and the deposit invoice).
- New route `/q/:token` — a branded page showing the quote summary, the stay details and a single **Accept quote** button. Expired or already-accepted quotes show a clear message instead of the button.
- The email CTA links to `{app}/q/{token}`.

**After they accept — the thank-you page.**

- Confirmation screen: quote accepted, dates confirmed, and "your invoice is on its way by email".
- Their portal login is activated automatically at that moment (same mechanism the admin "Give portal access" panel uses): if the customer has no portal user yet, one is created with a temporary password and a "must change password on first sign-in" flag, and a welcome email with the temporary details is sent.
- The thank-you page then shows a **Pay the deposit now** button that takes them to the invoice in their portal.
- If the customer already has a portal login, no new credentials are sent — just the sign-in link.

**Portal feature setting.** Auto-activation is driven by the existing feature gate for the customer portal plus a new Hotel workflow setting, "Activate portal access when a quote is accepted" (default on). With the portal feature off, the thank-you page drops the portal button and simply says the invoice will be emailed.

## 3. Where the settings live

- Settings → Hotel workflow: "Activate portal access when a quote is accepted".
- Settings → Message templates: `quote_sent` already editable; add a `portal_welcome` template for the temporary-login email if one is not already present.

## Technical notes

- Migration: `estimates.public_token uuid default gen_random_uuid()` + unique index + backfill; grants for `anon` limited to the two security-definer RPCs, not the table.
- `accept_public_quote` runs `security definer`, `search_path = public`, and re-checks `hold_until`/status server-side so the link cannot be replayed.
- Temporary password generation and the welcome email reuse the existing `customer-portal-invite` edge function rather than new code.
- Files touched: `supabase/functions/_shared/quote-email.ts`, `supabase/functions/send-quote-email/index.ts`, new `PublicQuotePage.tsx` + route in `src/App.tsx`, `src/features/quotes/queries.ts`, `HotelWorkflowPage.tsx`, one migration.
