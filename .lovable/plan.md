# Fix "Address search is temporarily unavailable" in admin

## Confirmed diagnosis (live probes just run)

I called Google Places Autocomplete directly with the browser key currently in the app (`VITE_GOOGLE_MAPS_BROWSER_KEY`) using three referrers:

- `https://lovable.dev/` → 403 `API_KEY_HTTP_REFERRER_BLOCKED` — referrer not on the key's allowlist
- `https://sloppykisses.lovable.app/` → 403 `API_KEY_HTTP_REFERRER_BLOCKED`
- `https://sloppykisses.jaimar.dev/` → 403 `SERVICE_DISABLED` — **Places API (New) is not enabled**

Every response reports the key's owning project as **`411237970562`**. That is a *different* Google Cloud project from `sloppy-kisses-maps-505006`, where the server key, service account, Routes API and Route Optimization all work (self-test passed).

So this is not an app bug: the browser key comes from the wrong Google Cloud project, that project does not have Places API (New) enabled, and its referrer allowlist does not include the app's domains.

## Fix (Google Cloud only — no app code changes needed)

Preferred: put the browser key in the same project as everything else.

1. In Google Cloud, switch to project **sloppy-kisses-maps-505006**.
2. Ensure **Maps JavaScript API** and **Places API (New)** are enabled there.
3. Create a new API key named e.g. `SLOPPY_KISSES_MAPS_BROWSER_KEY_V2`.
4. Application restriction → **Websites (HTTP referrers)**, add:
   - `https://lovable.dev/*`
   - `https://*.lovable.app/*`
   - `https://*.lovableproject.com/*`
   - `https://sloppykisses.jaimar.dev/*`
   - `https://*.jaimar.dev/*`
   - `http://localhost:8080/*`
5. API restriction → limit to **Maps JavaScript API** and **Places API (New)** only.
6. Send me the new key; I update `VITE_GOOGLE_MAPS_BROWSER_KEY` in `.env`.

Alternative if you want to keep the existing key: enable Places API (New) in project `411237970562` and add the same referrer patterns to that key. Works, but leaves browser and server credentials split across two projects.

## Verification after the key is in place

- Open Edit customer in admin, type a Johannesburg address, confirm suggestions appear and no red message shows.
- Select a suggestion and confirm the verified address card renders with Place ID and coordinates.
- Repeat on `sloppykisses.lovable.app` and `sloppykisses.jaimar.dev`.
- Confirm the browser console has no `RefererNotAllowed` or Places errors.

## Scope

No database, RLS, or component logic changes. The only app change is swapping the browser key value in `.env` once you supply it.
