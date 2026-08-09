# Address lookup: one setting left in Google Cloud

## Where we actually are (just re-tested, 19:0x SAST)

I called Places Autocomplete with your browser key, spoofing each real origin:

| Origin | Result |
|---|---|
| `https://lovable.dev/` | 403 `SERVICE_DISABLED` |
| `https://sloppykisses.lovable.app/` | 403 `SERVICE_DISABLED` |
| `https://sloppykisses.jaimar.dev/` | 403 `SERVICE_DISABLED` |
| `http://localhost:8080/` | 403 `SERVICE_DISABLED` |

Two things this tells us:

1. **Your referrer work fixed that half.** The earlier `API_KEY_HTTP_REFERRER_BLOCKED` is gone on every origin.
2. **One blocker remains**: Google says *"Places API (New) has not been used in project 411237970562 before or it is disabled."*

Also confirmed from your screenshots: project number `411237970562` **is** `sloppy-kisses-maps-505006`. My earlier note about "two different Google projects" was wrong — there is only one, and the server-side keys are fine in it.

## Why the key screen looks correct but still fails

The key's *API restrictions* list (Maps JavaScript API + Places API (New)) is an allowlist on the key. It is separate from whether the **service** is switched on for the project. A common trap: the project has the **legacy "Places API"** enabled, while **"Places API (New)"** (`places.googleapis.com`) is a distinct entry that is still off. The key can list it without the service being active.

## What to do

1. Open, in project `sloppy-kisses-maps-505006`:
   `https://console.cloud.google.com/apis/library/places.googleapis.com?project=sloppy-kisses-maps-505006`
2. If the button says **Enable**, click it. If it says **Manage/Disable**, the service is already on and I will re-probe and chase the next signal instead of guessing.
3. Give it 2–5 minutes to propagate.
4. Tell me, and I re-run the same four-origin probe.

## Then I verify

- Re-run the probe across all four origins and confirm suggestions come back.
- Open Edit customer in admin, type a Bryanston address, confirm the dropdown appears with no red message.
- Select one and confirm the verified address card shows Place ID and coordinates, and that it persists on save/reopen.
- Confirm the same on `sloppykisses.lovable.app` and `sloppykisses.jaimar.dev`.

## Scope

No code, database, or key changes. `.env`, `googleMaps.ts` and `AddressAutocomplete.tsx` are already correct — the only remaining action is the Google Cloud service toggle.
