# Make the whole hotel quote email editable, not just the intro

## Why you only see one paragraph

The `quote_sent` message template holds **only the intro copy**. Everything else in that email — the hero banner, the stay/price card, the "Accept this quote" button, and the five information cards ("Arrival & collection", "Before you arrive", "What to pack", "Where they'll stay", "Good to know"), plus the sign-off and footer — is hard-coded in the send-quote-email code. The one exception is the "House guidelines" block, which already comes from Hotel workflow settings (`guidelines_md`).

So today the ladies can change the greeting, and nothing else — which is exactly the problem you raised.

## What to build

A new **Hotel quote email** section in Settings that owns the full body of that email, section by section, in the same rich-text editor already used for message templates.

Editable pieces:
- **Hero headline** (e.g. "A holiday for {{pet.names}}") and the small label above it.
- **Intro** — stays where it is today, on the `quote_sent` template.
- **Stay & price card labels** — "Total for the stay", "50% deposit to secure", the "dates held until" line, and the CTA button text. Values stay computed.
- **Section heading** above the cards ("Everything you need before the stay").
- **Information cards** — a repeatable list. Each card has a title and rich-text content, can be reordered, hidden or deleted, and new cards can be added. The five current cards are seeded as the starting content, word for word, so nothing changes until they edit it.
- **Sign-off** ("We can't wait to spoil {{pet.names}}." / "Warmly, The … team").
- **House guidelines** — keep as-is, sourced from Hotel workflow settings, with a toggle for whether it appears in the email.

Also:
- Variable chips ({{pet.names}}, {{quote.number}}, {{quote.dates}}, {{quote.total}}, {{quote.deposit}}, {{quote.valid_until}}, {{tenant.name}}, …) available in every section.
- A **live preview** of the complete email with sample data, and a **Send test** button that sends the real thing to the test-recipient allowlist.
- **Reset to default** per section and for the whole email.

## Technical notes

- New table `hotel_quote_email_settings` (one row per tenant): hero label/headline, intro handling flag, card labels, CTA text, section heading, sign-off, `cards jsonb` (ordered array of `{id, title, body_html, enabled}`), `show_guidelines boolean`. Standard grants + RLS scoped to tenant admins, `service_role` full access for the edge function.
- `supabase/functions/_shared/quote-email.ts` keeps all layout, table structure, brand colour and the SMTP-safe line wrapping; it stops holding copy and instead takes the settings row. Where the row is missing, it falls back to the current hard-coded defaults so existing tenants see no change.
- Card bodies are sanitised on save and on send with the existing `sanitizeEmailHtml` / `styleBodyHtml` helpers, and the plain-text alternative is derived with `htmlToText`, so the text part stays in step with the HTML automatically.
- `send-quote-email` loads the settings row alongside the template and passes it through; the public quote link and PDF attachment are untouched.
- New UI: `src/features/settings/HotelQuoteEmailPage.tsx` reusing `RichTextEditor.tsx`, linked from the Settings index and gated by the same permission as the other comms settings.
- Files touched: one migration, `_shared/quote-email.ts`, `send-quote-email/index.ts`, new settings page + queries, Settings index entry.
