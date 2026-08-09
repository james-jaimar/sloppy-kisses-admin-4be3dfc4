# Restore Google address lookup

## Confirmed diagnosis

Direct browser calls using the configured browser key reproduced the failure:

- On the published and custom domains, Google returns: **Places API (New) has not been used in project `411237970562` or is disabled**.
- In the Lovable preview, Google sees the effective referrer as `https://lovable.dev/` and returns: **Requests from this referrer are blocked**.
- The address component is reaching Google correctly; the failure is now in the browser key's Google Cloud API/referrer configuration, not the customer data or Supabase.

## Fix

### 1. Correct the Google Cloud browser-key setup

In the Google Cloud project owning the current browser key:

- Enable **Places API (New)** (`places.googleapis.com`).
- Keep **Maps JavaScript API** enabled.
- Keep the key restricted to those browser APIs rather than opening it to all Google APIs.
- Add these HTTP referrer patterns:
  - `https://lovable.dev/*` for the embedded Lovable preview
  - `https://*.lovable.app/*`
  - `https://*.lovableproject.com/*`
  - `https://sloppykisses.jaimar.dev/*`
  - `https://*.jaimar.dev/*`
  - `http://localhost:8080/*` for local verification

These are Google Cloud settings; no replacement key is required if the existing key belongs to the intended project.

### 2. Harden the address control's failure behaviour

- Recognise Google permission/configuration failures and stop repeated lookups until the user edits or retries.
- Keep technical details in the console, while showing only a short neutral fallback in the form.
- Ensure the input remains editable and the staff-only manual address route remains available.
- Preserve the successful path: suggestions, Place Details, canonical Place ID, coordinates, and parsed address fields.

### 3. Verify all real origins

After Google propagates the settings:

- Confirm suggestions appear for a Johannesburg address in the Lovable preview.
- Confirm the same lookup works on `sloppykisses.lovable.app` and `sloppykisses.jaimar.dev`.
- Select a result and verify the form changes to the routing-verified address card.
- Save and reopen the customer to confirm the Place ID, coordinates, and formatted address persist.
- Confirm there are no `RefererNotAllowed`, `API not enabled`, or Places request errors in the browser console.

## Scope

No database, routing, backfill, or customer-record migration changes are needed for this fix.