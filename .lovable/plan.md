
# Documents storage — S3 + customer uploads + retention

Move all customer/pet documents off Supabase Storage onto a dedicated S3 bucket for Sloppy Kisses, let customers upload from the portal, and enforce a 3-year retention plus pet-deceased archive/delete.

## 1. S3 setup (new dedicated bucket)

- Ask you to create a fresh AWS S3 bucket (e.g. `sloppykisses-docs`) in your preferred region, with:
  - Block Public Access ON (all objects served via signed URLs)
  - CORS allowing `PUT` and `GET` from the app + custom domain origins
  - Lifecycle rule: transition to Glacier Instant Retrieval at 1 year (cost win)
- Connect it via `standard_connectors--connect` with `connector_id: aws_s3` as a **new** connection (not reusing Printmypics), with `write` scope enabled.
- Object key layout: `tenants/{tenant_id}/pets/{pet_id}/{doc_id}-{filename}` and `tenants/{tenant_id}/customers/{customer_id}/{doc_id}-{filename}`.

## 2. Schema changes (`documents` table)

Add:
- `storage_provider text` ('s3' | 'supabase') — default 's3' going forward
- `s3_bucket text`, `s3_key text`
- `size_bytes bigint`, `content_type text`, `checksum text`
- `uploaded_by_profile_id uuid`, `uploaded_via text` ('portal' | 'admin')
- `expires_at date` (auto-set for vaccination_certificate = administered/issued + 3 years; nullable for others)
- `archived_at timestamptz`, `archive_reason text` ('expired' | 'pet_deceased' | 'manual')
- `deleted_at timestamptz` (soft delete before hard purge)

Keep existing `file_path` for legacy Supabase rows; reads branch on `storage_provider`.

## 3. Edge functions

- `documents-sign-upload` — validates tenant/customer/pet access, size (<20 MB), mime whitelist (pdf/jpg/png/heic), inserts `documents` row in `pending` state, returns S3 signed PUT URL.
- `documents-sign-download` — resolves row, checks RLS via caller, returns signed GET URL (5 min).
- `documents-confirm-upload` — client calls after successful PUT; HEAD's the object to record size/checksum, flips row to `ready`.
- `documents-purge` — scheduled daily via `pg_cron`:
  - Archive rows past `expires_at` (set `archived_at`, keep object 90 days).
  - Hard delete S3 object + row when `archived_at` older than 90 days.
  - When a pet is marked deceased, mark all its docs `archived_at = now()`, `archive_reason='pet_deceased'` (grace 90 days then purge).

## 4. Retention & pet-deceased flow

- Add `pets.deceased_at date` + admin/customer toggle on pet detail (already partially there via status? — will verify and reuse if so).
- Trigger `pets_deceased_archive_docs` on `pets` update: when `deceased_at` transitions from null → date, archive all documents for that pet.
- Vaccination uploads: on insert, if `document_type='vaccination_certificate'` and linked `vaccinations.expiry_date` exists, set `documents.expires_at = expiry_date`; else default 3 years from `uploaded_at`.

## 5. Portal & admin UI

- **Customer portal — `MyPetDetailPage`**: "Upload vaccination certificate" button → picks type (rabies/5-in-1/kennel cough/other), date, file → uses signed upload flow → shows list of their pet's docs with expiry badge + download.
- **Customer portal — `MyDocumentsPage`**: allow deleting own uploads before staff verify; show expiry.
- **Admin — pet detail Documents tab**: same upload flow + "verify" toggle so admin can mark vaccination valid (feeds existing `hotel_can_confirm_booking` gate).
- **Admin — customer detail Documents tab**: proof-of-payment uploads with link back to invoice.
- **Settings — Documents**: retention days per type (default 1095), archive grace period (default 90), toggle to auto-purge or manual review queue.

## 6. Migration of existing rows

- Only Branding assets (logo/favicon) stay on Supabase Storage — those are not `documents` rows, so nothing to migrate today.
- Add a one-off script placeholder for any legacy `documents.file_path` rows if they exist (will check count before running).

## Technical details

- All S3 traffic server-side via Lovable connector gateway; `AWS_S3_API_KEY` + `LOVABLE_API_KEY` used only in edge functions.
- Signed URL TTL: uploads 10 min, downloads 5 min.
- RLS unchanged in principle: `documents` rows still guarded by tenant/customer/pet access helpers; portal signed-URL function re-checks before signing.
- No public bucket policy; browser never talks to S3 without a signed URL.
- File size ceiling 20 MB per doc (matches Lovable upload limit); larger PDFs rejected client-side with a clear error.
- `documents-purge` runs 03:00 SAST daily; logs summary to `activity_log`.

## Open items to confirm during build

- Confirm the exact list of vaccination `document_type` values you want in the portal picker (rabies, 5-in-1, kennel cough, other?).
- Confirm the AWS region for the bucket so CORS/latency are right.
