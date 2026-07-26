## Goal

Make the first-login experience on the customer portal feel intentional and Sloppy-Kisses-branded — not a bare modal — with clear framing for existing paper-based customers, a 30-day grace window before it becomes blocking, and admin visibility into who has/hasn't completed it.

## Current state (verified)

- `ConsentGate` and `ConsentWizard` render as a hard black-overlay modal the moment a portal customer loads any page. There is no soft intro, no "later" option, no branding, no progress recovery beyond the step dots.
- Admin has `Settings → Terms & Registration` (CRUD on versions, mark-current). No admin view of *which customers have accepted / are outstanding*.
- No grace period concept exists in schema or UI. `customer_consents` records signatures; `tenant_terms_versions.is_current` flags what's live. Nothing tracks when a customer was first prompted.
- Wording in the wizard header says "Welcome … one-off setup" and "We're moving from paper forms to a new online system" — decent but buried; existing customers have no upfront explanation before the modal slams open.

## What we'll build

### 1. Grace period (30 days, admin-configurable)

- Add `consent_grace_days` (int, default 30) to `policy_settings`. Editable in `PolicySettingsPage`.
- Add `consent_prompted_at` (timestamptz) to `customers`. Set on first portal login when the gate detects outstanding items and it's still null.
- Compute `daysRemaining = grace_days - days_since(consent_prompted_at)`.
  - `daysRemaining > 0` → **soft mode**: wizard opens on login but is dismissible ("Remind me later"). A persistent yellow banner sits above every portal page: "Please complete your registration — X days left."
  - `daysRemaining ≤ 0` → **hard mode**: wizard is blocking (current behaviour), no dismiss button. Banner turns red: "Registration overdue — please complete to keep booking."

### 2. Portal UX polish

- Replace the bare modal chrome with a branded shell: Sloppy Kisses logo, coral accent, softer overlay, rounded card, calm typography.
- Add an **intro step (step 0)** shown once — no form, just warm copy:
  - Headline: "Welcome to your Sloppy Kisses portal 🐾"
  - Body (for existing customers): "You've trusted us with your pets for a while — thank you. We're moving off paper and into this new portal so everything lives in one place. To finish setting up your digital profile we just need you to confirm a few details and re-sign our terms and daycare registration. It takes 3–4 minutes, and you can save and come back within 30 days."
  - Buttons: **Start now** / **Remind me later** (later only visible during grace).
- Progress bar with labelled steps ("Your details" · "Terms & Conditions" · "Daycare Registration" · "Done").
- Success step with confetti-free but friendly "All set — thank you!" card, link back to dashboard.
- Better field grouping in the "missing details" step (Contact / Address / Identity / Emergency contact / Vet) with section headings and inline help ("We use this if we can't reach you and your pet needs a vet urgently").
- Render `body_markdown` as actual Markdown (currently rendered as `whitespace-pre-wrap` text). Use existing markdown renderer if present, else a minimal one.
- Signature block styled like a signature (script-ish font/italic on the typed name, timestamp + IP shown below "Signed by … on 26 Jul 2026 at 14:32").
- Mobile pass: full-height sheet on `sm:` viewports, sticky footer with Continue button.

### 3. Dashboard nudge

- On `CustomerDashboard`, when consent is outstanding, show a prominent card at the top ("Finish your registration — X days left") linking to `/customer/registration` (a dedicated route that opens the wizard directly). This gives users a way back into it after dismissing.

### 4. Admin visibility

- New settings sub-page **Settings → Consent status** (or a tab inside Terms & Registration) listing every portal-enabled customer with columns:
  - Name · Email · Prompted on · Days left · T&Cs accepted (version) · Registration accepted (version) · Missing fields count
  - Filter: All / Outstanding / Overdue / Complete. Export CSV. Row action: "Send reminder email".
- Uses `notification_events` with a new `consent_reminder` template so the existing comms pipeline handles delivery.

### 5. Existing-customer copy

Wording lives in Terms & Registration seed / intro screen and reminder email. Draft:

> "Sloppy Kisses is going fully digital. Your paper registration and signed terms from your first visit are still on file — this is simply the digital equivalent so you can manage everything (bookings, invoices, vaccines) from your phone. Nothing changes about the service you've always had with us."

## Out of scope for this round

- Actual field expansion / new mandatory fields (that's your next task — you said "before I even look at all that").
- Admin bulk re-issue of consent versions (already covered by "Mark current").
- Email/WhatsApp templates beyond the reminder cadence copy.

## Technical notes

- Migration: `ALTER TABLE customers ADD COLUMN consent_prompted_at timestamptz;` and `ALTER TABLE policy_settings ADD COLUMN consent_grace_days int NOT NULL DEFAULT 30;`
- `useConsentStatus` gains `graceDaysLeft: number | null`, `mode: 'soft' | 'hard' | 'none'`, sets `consent_prompted_at` via RPC on first evaluation.
- New route `/customer/registration` renders `ConsentWizard` full-page (not modal) for users who dismissed it.
- Reminder cron: reuse `queue-booking-reminders` scheduler pattern; add job that inserts `notification_events` for customers with `daysRemaining ∈ {14, 7, 3, 1, 0}`.
- Files touched: `consentQueries.ts`, `ConsentWizard.tsx`, `ConsentGate.tsx`, `CustomerLayout.tsx`, `CustomerDashboard.tsx`, `PolicySettingsPage.tsx`, new `ConsentStatusPage.tsx`, new migration, new edge function `queue-consent-reminders`.
