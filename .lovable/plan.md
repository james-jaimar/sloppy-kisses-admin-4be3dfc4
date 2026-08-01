
## 1. Collapsible sections on the portal pet page

Add a small reusable `CollapsibleCard` (chevron + title, remembers open/closed per section) and wrap the three long panels on `/customer/pets/:id`:

- Grooming preferences — collapsed by default once saved, open when "Not set yet" or when arriving via `#grooming`
- Vaccinations — open when something is missing/expired, otherwise collapsed
- Documents — collapsed by default

Each header keeps its status chip visible while collapsed (e.g. "Saved", "2 required outstanding", "3 files"), so the customer sees state without expanding. Same treatment on the admin pet detail page for consistency.

## 2. Admin-defined vaccine catalog

Today `vaccination_rules` stores per-service requirements (service, vaccine text, species, grace days, required) but vaccine names are free text, and the customer types the name by hand.

New tenant-scoped `vaccine_types` catalog table: code, display name, species, default validity (months), notes/help text, active, sort order. `vaccination_rules.vaccine_type` becomes a picker over this catalog instead of a free-text box.

Settings → Vaccination rules gets a second section "Vaccine types" with full CRUD, gated by the existing `settings.vaccination.manage` permission. Existing free-text values are seeded into the catalog so nothing is lost.

## 3. One modal: record vaccination + upload certificate

Rewrite the vaccination modal (used on portal and admin pet pages) so it is a single flow:

- Vaccine — dropdown of active catalog entries for the pet's species (plus "Other" with free text for staff)
- Administered date; Expiry auto-filled from the catalog's default validity, still editable
- Certificate — file picker inside the same modal; on save it uploads to S3 and links the resulting document to the vaccination row (`vaccinations.document_id`, already exists) with `type = 'vaccination'`
- Save is one action: record + upload + link, with a single success/failure toast

The pet's vaccination panel becomes a requirements checklist: every catalog vaccine that is required for the tenant's services shows a row with state — Missing / Awaiting certificate / Expiring soon / Expired / Valid — and a "Provide details" button opening the same modal. This gives the customer an explicit "you need to give us this" list rather than a blank Add button.

Documents panel on the pet page then drops "Vaccination cert" from its type list (vaccination certs arrive via the vaccination modal) and keeps Medical / vet, Consent form, Other. Existing vaccination documents still list there.

## 4. Upload error that still uploaded

Confirmed state: the file you uploaded (`pic20.jpg`) is on S3 but its row is still `status = pending` with no size/checksum, so the final confirm step failed after a successful S3 PUT — hence "error, but it uploaded". Root cause is not yet proven: `documents-confirm-upload` responds (it is deployed) but produced no log line, and it calls a `HEAD` through the Lovable connector gateway which is the most likely failure point.

Fix, in order:
1. Add explicit logging to `documents-confirm-upload` and re-run one upload to capture the real error.
2. Make confirm resilient: if the `HEAD` check fails but the browser reported a successful PUT, still mark the row `uploaded` using the client-reported size/content type, and record a `checksum = null` — never leave a successfully uploaded file stuck in `pending`.
3. Surface the actual server error text in the toast (currently only the generic `FunctionsHttpError` message reaches the UI).
4. Repair the existing stuck row so it shows as uploaded rather than PENDING.

### Technical notes
- New table: `public.vaccine_types` with tenant scoping, GRANTs, RLS (staff manage, authenticated customers read their tenant's active rows).
- `vaccinations.document_id` already exists — no schema change needed for the certificate link.
- Upload path stays sign → PUT → confirm; only the confirm step's error handling changes.
