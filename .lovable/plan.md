# Fix Google Cloud project ID mismatch

The Google Cloud welcome screen shows the live project is:

- **Project number:** `935426076650`
- **Project ID:** `project-ca5514d4-d41b-4a5c-9aa`

The app currently stores a different `GOOGLE_CLOUD_PROJECT_ID` secret, so Route Optimization calls fail with the wrong project path.

## Plan

1. **Update the Supabase secret**
   - Set `GOOGLE_CLOUD_PROJECT_ID` to `project-ca5514d4-d41b-4a5c-9aa`.
   - Leave `GOOGLE_MAPS_SERVER_KEY`, `GOOGLE_ROUTING_SA_JSON`, and `GOOGLE_API_KEY` untouched.

2. **Verify the service account belongs to the same project**
   - Confirm the service account JSON in `GOOGLE_ROUTING_SA_JSON` has a `project_id` or `client_email` domain that matches `project-ca5514d4-d41b-4a5c-9aa`.
   - If it does not match, flag it before running the self-test.

3. **Re-run `google-maps-selftest`**
   - Call the edge function from the browser/Supabase client as a staff user.
   - Confirm both checks pass:
     - Routes API `computeRouteMatrix`
     - Route Optimization `optimizeTours`

4. **Report back**
   - Share the self-test JSON result.
   - If Route Optimization still fails, surface the exact Google error so the service-account role can be corrected in Google Cloud.

## No code changes
This is a configuration correction only; no source files need editing unless the self-test reveals a secondary issue.
