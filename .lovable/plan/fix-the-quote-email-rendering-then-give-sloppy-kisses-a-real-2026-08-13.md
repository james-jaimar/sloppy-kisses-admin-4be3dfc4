# Fix the quote email rendering, then give Sloppy Kisses a real template editor

## 1. The rendering snags (gap in "Before you arrive", giant "Trial Days" text)

I have not confirmed the cause yet, so the first step is diagnosis, not a guess. What I have checked: the generated HTML's longest line is 798 characters, which rules out the classic "SMTP hard-breaks lines over 998 characters" mangling. That leaves two live suspects — how the mailer quoted-printable-encodes the body (the same encoder that produced the earlier `=20` artifacts), and how Outlook renders the house-guidelines block, which is the only part built from free-text markdown and the only part using fractional font sizes.

**Step 1 — reproduce and prove the cause**
- Render the exact email HTML, using the tenant's real guidelines text, in a headless browser at Outlook-ish widths and capture the same two areas shown in the screenshots.
- Capture the raw MIME of a test send (to the existing test-recipient allowlist) and inspect the encoded body around the "Before you arrive" card and the "Trial Days" paragraph for broken tags or attributes.
- Only then name the cause.

**Step 2 — fix it, and harden the parts that make this class of bug possible**
- Rebuild the guidelines block with the same table-based structure as the other cards instead of loose `div`/`p` markup.
- Whole-pixel font sizes everywhere (no `13.5px`), with an explicit font size, line height and family on every text-bearing element, so nothing can fall back to a client default.
- Add the standard Outlook resets (mso conditional block, `<style>` reset, fixed table widths, `word-break` on free text) that stop Word/Outlook inflating or padding blocks.
- Emit the HTML pre-wrapped into short lines at safe tag boundaries so the encoder never has to break a long line itself.

**Step 3 — verify** by sending to the test recipient again and comparing against the screenshots.

## 2. A proper template editor for the team

Today the body of every message template is a plain textarea, and the visual layout of the quote email lives in code — which is why any wording or styling change needs a developer.

**What they get**
- A rich-text (WYSIWYG) editor on Settings → Message templates: bold, italic, headings, bullet and numbered lists, links, undo/redo.
- An "Insert variable" menu listing the tokens valid for the selected event (`{{customer.first_name}}`, `{{quote.total}}`, …), inserted at the cursor.
- A live preview that renders the body inside the real branded email shell with sample data, so what they see is what the customer gets.
- An HTML source toggle for anyone who wants it, and the existing "Send test" button unchanged.
- A "Start from the default wording" action per event, so any event without a template yet can be created and edited without a developer.

**How it stays safe**
- Bodies are sanitised on save and again on send (allowlist of tags and attributes), so nothing can inject scripts or break the layout.
- Existing plain-text templates keep working untouched; a template only switches to rich mode once saved from the new editor.
- The plain-text version of every email is generated automatically from the rich body.

## Technical notes

- Editor: TipTap (`@tiptap/react` + StarterKit + Link) — small, no external service.
- Migration: `message_templates.body_format text not null default 'text'` (`'text' | 'html'`); grants unchanged, no new table.
- `_shared/comms-transport.ts` → `renderBrandedHtml` uses the body verbatim (sanitised, inline font defaults applied) when `body_format = 'html'`, otherwise keeps today's paragraph wrapping; the plain-text alternative is derived by stripping tags.
- `send-notifications` and `notify-test-send` pass `body_format` through; `send-quote-email` treats an HTML `quote_sent` body as the intro block.
- Shared sanitiser lives in `supabase/functions/_shared/` and is mirrored for the client preview.
- Files touched: `_shared/quote-email.ts`, `_shared/comms-transport.ts`, `send-notifications`, `notify-test-send`, `send-quote-email`, `src/features/settings/MessageTemplatesPage.tsx`, new `src/features/comms/RichTextEditor.tsx`, `src/features/comms/queries.ts`, one migration.