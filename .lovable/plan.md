# Google Cloud setup for maps, addresses and van routing

A step-by-step setup you do in Google Cloud, plus exactly which values I then store in the app. Nothing in the codebase changes until this is done.

## Part 1 — In Google Cloud (you do this)

### 1. Project and billing
Create a project named `sloppy-kisses-maps` and attach a billing account. Maps APIs need billing enabled even inside the free monthly credit.

### 2. Enable exactly these four APIs
- Maps JavaScript API — the map views
- Places API (New) — address autocomplete and place details
- Routes API — travel time between stops (`computeRoutes`, `computeRouteMatrix`)
- Route Optimization API — three-van stop sequencing

Do not enable Directions API, Distance Matrix API, or Places API (legacy). They are the old services and we will not call them.

### 3. Browser key (public, goes in the JS bundle)
Create an API key named `SLOPPY_KISSES_MAPS_BROWSER_KEY`.

Application restriction — HTTP referrers, add all of:
```text
https://sloppykisses.jaimar.dev/*
https://*.sloppykisses.jaimar.dev/*
https://sloppykisses.lovable.app/*
https://*.lovable.app/*
https://*.lovableproject.com/*
http://localhost:*
```
API restriction — only:
- Maps JavaScript API
- Places API (New)

This key being visible in the browser is expected and safe; the referrer + API restrictions are what protect it.

### 4. Server key (secret, used by edge functions)
Create a second API key named `SLOPPY_KISSES_MAPS_SERVER_KEY`.

Application restriction: **None** (Supabase edge functions have no fixed IP and send no referrer — a referrer-restricted key will fail every server call).
API restriction — only:
- Routes API
- Places API (New)
- Geocoding API (only if you also enable it; optional, for cleaning up legacy addresses later)

### 5. Service account (for Route Optimization only)
Route Optimization does not accept API keys — it needs OAuth.

- Create a service account named `sloppy-kisses-routing`
- Grant role **Route Optimization Editor** (`roles/routeoptimization.editor`)
- Create a JSON key and download it
- Keep the file off GitHub and off your desktop once loaded

You will also need your Google Cloud **project ID** (e.g. `sloppy-kisses-maps-473201`), shown on the project dashboard.

## Part 2 — What I store in the app (after you have the values)

| Value | Where it lives | Used by |
|---|---|---|
| Browser key | `.env` as `VITE_GOOGLE_MAPS_BROWSER_KEY` (public) | Maps JS + Places autocomplete in React |
| Server key | Supabase secret `GOOGLE_MAPS_SERVER_KEY` | Routes API, Place Details from edge functions |
| Service account JSON | Supabase secret `GOOGLE_ROUTING_SA_JSON` (whole file pasted as one line) | Route Optimization edge function |
| Project ID | Supabase secret `GOOGLE_CLOUD_PROJECT_ID` | Route Optimization request path |

The two Supabase secrets are requested through the secure secret form, never typed into chat or committed.

## Part 3 — Verification I run once the keys exist

1. A tiny `google-maps-selftest` edge function that:
   - calls Routes API `computeRouteMatrix` for two Bryanston points using the server key
   - mints an OAuth token from the service account JSON and calls Route Optimization with a one-van, two-stop request
   - returns a pass/fail line per check with the raw Google error text if anything is denied
2. A browser check that Maps JS + Places autocomplete load in the preview with the browser key.

Common failures and their meaning are reported back plainly: `API_KEY_HTTP_REFERRER_BLOCKED` means the server key still has referrer restrictions; `API_KEY_SERVICE_BLOCKED` means the API is not on that key's allow-list; `PERMISSION_DENIED` on optimization means the service account is missing the Route Optimization Editor role.

## Portability note
Nothing here uses the Lovable Google Maps connector, so this survives the move to AWS Amplify. All Google access is centralised in one shared helper (`supabase/functions/_shared/google.ts`) plus one browser loader module, so hosting changes touch nothing else.

## Not in this step
No autocomplete UI, no route optimisation screen, no geocoding of the 1,552 backfilled addresses yet. Those are Phase C onwards, once the self-test is green.
