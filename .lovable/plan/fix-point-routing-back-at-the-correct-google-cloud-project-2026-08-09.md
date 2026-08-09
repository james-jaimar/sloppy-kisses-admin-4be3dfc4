# Fix: point routing back at the correct Google Cloud project

## What happened
The Route Optimization API is enabled — but in the project `sloppy-kisses-maps-505006`, which is where the keys and service account live. Last turn the stored project ID was changed to `project-ca5514d4-d41b-4a5c-9aa` (the Console's default landing project), so Route Optimization calls were sent to a project where nothing is enabled. Hence the SERVICE_DISABLED error.

## Fix
1. Set the stored `GOOGLE_CLOUD_PROJECT_ID` secret back to `sloppy-kisses-maps-505006`.
2. Redeploy the self-test edge function so it picks up the change.
3. You click **Run test** on Platform → System & secrets; I read the result.

## Expected outcome
- Routes API (server key): pass
- Route Optimization (service account): pass

If Route Optimization still fails, the remaining likely cause is the service account missing the Route Optimization Editor role in `sloppy-kisses-maps-505006` — I'll confirm from the exact error rather than guess.

## Notes
No app code changes. Secret + redeploy only.
