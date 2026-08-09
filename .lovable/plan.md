# Enable Route Optimization API in Google Cloud

## What the self-test is telling us

The Routes API check passes, but Route Optimization returns:

```text
SERVICE_DISABLED
Route Optimization API has not been used in project project-ca5514d4-d41b-4a5c-9aa before or it is disabled.
```

This is a Google Cloud console setting, not an app bug. The service account and project ID are now correct; the API itself is simply switched off for this project.

## Step 1 — Enable the API (you do this in Google Cloud)

Open this exact link while signed in to the Google Cloud project:

```text
https://console.developers.google.com/apis/api/routeoptimization.googleapis.com/overview?project=project-ca5514d4-d41b-4a5c-9aa
```

Then click **Enable**. Billing must already be attached to the project.

Also confirm these APIs are enabled on the same project:

- Maps JavaScript API
- Places API (New)
- Routes API

## Step 2 — Wait for propagation

After enabling, wait 2–3 minutes for Google's systems to propagate the change.

## Step 3 — Re-run the self-test (I do this)

Once you confirm the API is enabled, I will:

1. Re-run the **Google Maps self-test** on Platform → System & secrets.
2. Report back whether Route Optimization now returns a valid tour.
3. If it still fails, surface the exact new error so we can fix the next item (likely service-account role or API restrictions).

## No code changes required

This is purely a Google Cloud API-enablement step. The app and edge-function code are already correct for the new project ID.
