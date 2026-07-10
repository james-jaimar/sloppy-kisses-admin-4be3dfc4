
Three related pieces of plumbing: outbound email transport, tenant branding (logo + colour scheme wired into the running app), and a proper PDF invoice ported from the document-centre PostNet layout.

---

## 1. Email server settings

Add an **Admin → Settings → Email server** page (permission `settings.email.manage`) for SMTP credentials used to actually send mail.

Stored in a new `email_transport_settings` table (one row per tenant):
- `provider` — `smtp` for now (leave room for `gmail`, `microsoft` later)
- `smtp_host`, `smtp_port`, `smtp_secure` (SSL/TLS/STARTTLS)
- `smtp_username`, `smtp_password` (server-side only — never returned to the client)
- `from_name`, `from_email`, `reply_to`
- `last_test_at`, `last_test_ok`, `last_test_error`

Behaviour:
- The settings page reads a redacted view (`smtp_password` masked as `••••` — a `has_password` boolean tells the UI whether one is set). Save uses an edge function (`email-settings-save`) that runs with the service role so the password never sits in a client-readable row.
- "Send test email" button hits a new `send-test-email` edge function that pulls creds, sends via SMTP, and writes the outcome to `last_test_*`.
- A `send-email` edge function centralises actual sending (used later by invoice email, booking confirmations, etc.). The existing `notification_events` dispatcher will call this once wired.
- The old `comms_settings` row keeps quiet hours / from identity (display), but sender identity is copied from here on save so the two stay in sync.

Note: this does not touch Supabase's auth email templates.

---

## 2. UI / brand settings

Add **Admin → Settings → Branding** (permission `settings.branding.manage`).

Schema — extend `tenants`:
- Already exists: `logo_url`, `primary_colour`, `secondary_colour`.
- Add: `logo_dark_url` (optional, for dark backgrounds), `accent_colour`, `favicon_url`.

Storage:
- New public Storage bucket `tenant-branding`. Path: `<tenant_id>/logo.png` etc. RLS: tenant staff with `settings.branding.manage` can write; anyone can read (logos must load on public pages).

Page:
- Logo upload (drag-drop, previews light + optional dark version).
- Colour pickers for primary / secondary / accent with live swatches.
- "Reset to Sloppy Kisses defaults" button.

Wiring the running app:
- New `BrandingProvider` inside `TenantContext` reads the tenant row and, on mount / tenant change, writes the colours into CSS custom properties on `:root` (`--sk-coral`, `--sk-turquoise`, `--sk-accent`) by converting hex → HSL. All existing components already use these semantic tokens, so the whole UI reskins automatically.
- `AppHeader` and `Logo` component read `tenant.logo_url` (with the current SVG as the fallback).
- Favicon injected into `<head>` at runtime when set.

---

## 3. PostNet-style invoice PDF

Port `generate-invoice-pdf` from the document-centre project (uses `pdf-lib` + `@pdf-lib/fontkit` + embedded Noto Sans; PostNet-style bordered header/metadata strip, 7-column items table, terms, totals, banking, notes).

Adapted to Sloppy Kisses schema:
- Data source: `invoices` + `invoice_items` + `customers` + `invoicing_settings` + `tenants` (branding).
- Output: PDF bytes returned directly (streaming download) — no storage bucket needed initially since invoices are small and regenerable. If we later want emailed attachments cached, we add an `invoice_pdfs` bucket then.
- New edge function `generate-invoice-pdf` with `verify_jwt = true`. Input: `{ invoice_id }`. Resolves tenant, checks the caller can access it via `user_has_permission(tenant_id,'invoices.view')`.

UI:
- **Download PDF** button on `InvoiceDetailPage` + row action on `InvoicesListPage`.
- Customer portal: **Download PDF** on `MyInvoiceDetailPage` (uses `current_customer_id` check server-side).
- PDF picks up tenant logo + primary colour from step 2, and company/VAT/banking/footer from `invoicing_settings`.

Not in this pass: emailing the PDF to the customer (that's the next step once step 1 is verified working end-to-end).

---

## Technical section

### Migrations
1. `email_transport_settings` table + `has_password` view + grants + RLS (`settings.email.manage` to select redacted view; only service role writes password).
2. `tenants` add `logo_dark_url text`, `accent_colour text`, `favicon_url text`.
3. New `permissions` rows: `settings.email.manage`, `settings.branding.manage`; grant to `owner` and `manager` roles.
4. Storage bucket `tenant-branding` (public read, staff write via RLS on `storage.objects`).

### Edge functions
- `email-settings-save` (POST, JWT) — validates perm, upserts row, encrypts nothing (password is DB-only, not exposed via PostgREST because column-level grant excludes it from `authenticated`).
- `send-test-email` (POST, JWT).
- `send-email` (POST, service-role callable from other functions and JWT-callable from client for ad-hoc sends; validates perm).
- `generate-invoice-pdf` (POST, JWT) — streams `application/pdf`.

### Frontend
- `src/features/settings/EmailServerSettingsPage.tsx`
- `src/features/settings/BrandingSettingsPage.tsx`
- Add both to `SettingsIndexPage` (Email server, Branding).
- `src/lib/branding/BrandingProvider.tsx` — CSS variable + favicon injector.
- `src/features/invoices/pdf.ts` — helper that invokes the edge function and triggers browser download.
- Buttons on `InvoiceDetailPage`, `InvoicesListPage`, `MyInvoiceDetailPage`.

### Assumption to flag
SMTP creds are stored in the tenant DB row with column-level grants keeping the password away from `authenticated`. If you'd rather have SMTP creds held as project-level Supabase secrets (edge-function env vars) instead of per-tenant DB rows, say so before I start — that's a small pivot but changes the UI (no password field, just a "configured / not configured" indicator).
