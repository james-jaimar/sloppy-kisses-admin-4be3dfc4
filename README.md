# Sloppy Kisses operations platform

React + Vite frontend, with the existing external Supabase project providing authentication, data, storage, scheduled jobs and edge functions. Hosting the frontend on AWS Amplify does **not** move or redeploy Supabase.

## AWS Amplify deployment

1. Connect this Git repository and choose the deployment branch. The root `amplify.yml` installs Node 22 and pinned Bun 1.4.4, installs from `bun.lock` without changing it, and builds `dist`. There is no npm lockfile, so do not use `npm ci`.
2. Set these **build-time** environment variables in Amplify, using the existing Supabase project and Google Maps browser key:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`, supported by the client)
   - `VITE_GOOGLE_MAPS_BROWSER_KEY`
   `VITE_SUPABASE_PROJECT_ID` is not read by the frontend. Vite variables are public; never put service-role keys, SMTP passwords or payment secrets in them. Changing them requires a new build.
3. In Amplify **Rewrites and redirects**, add the following SPA rule (200 rewrite, not a redirect). Keep it below any intentional redirect rules:

   ```json
   [
     {
       "source": "</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|webp|avif|woff|woff2|ttf|map|json|pdf|webmanifest)$)([^.]+$)/>",
       "target": "/index.html",
       "status": "200"
     }
   ]
   ```

   This console configuration is separate from `amplify.yml`. Test direct navigation and refresh on `/login`, `/book/hotel`, `/q/<real-token>` and `/i/<real-token>`.
4. Deploy and check the Amplify temporary domain before switching customer links or DNS.

### Images

The four existing login/booking photographs are bundled in `src/assets` and imported directly. They no longer depend on Lovable's `/__l5e/` proxy or the old custom domain. The original `.asset.json` records are retained, unused, for provenance; CDN objects were not deleted, so earlier deployments are unaffected. Future public images must also be accessible from the chosen host.

## Domain cutover: app.sloppykisses.co.za

Do these only once the new host is working:

- Add the custom subdomain in Amplify and follow its DNS/certificate instructions. Keep the previous host available during the transition.
- In **Admin → Settings → Branding**, set App URL to `https://app.sloppykisses.co.za`. This controls quote links and tenant-aware emails.
- In the existing **Supabase Authentication → URL Configuration**, update Site URL and allow `https://app.sloppykisses.co.za/**`. Add the Amplify test domain if testing sign-in/reset there. Keep required old URLs during transition. Hosted authentication settings have not been verified or changed by this preparation.
- Review the Supabase edge-function `APP_BASE_URL` secret if configured: some senders use it before the tenant App URL, so an old value can keep invoice emails on the previous domain. Update through Supabase secrets, not Git.
- In **Payment Providers → PayFast**, open and save the configuration from the new domain, then verify stored return/cancel URLs. Leave the Supabase webhook URL unchanged. Test an actual payment round trip before go-live.
- In Google Cloud, add `https://app.sloppykisses.co.za/*` to the Maps browser key's allowed referrers, if restricted; include the Amplify test host when needed.
- If Xero or another OAuth provider has an app-domain callback registered, verify its callback/allowlist against the new domain; do not change Supabase-hosted callbacks unnecessarily.
- Check any tenant logo/document URLs and previously sent customer links. Changing App URL affects new links, not emails already sent. Retain the old host or configure redirects preserving paths and query strings for outstanding quote/invoice links.

## Go-live checks

- Login and password reset, including a customer portal login.
- Public booking photos, logo and Maps/address selection.
- Staff quote preparation, email/WhatsApp link, public acceptance and accepted status read-back.
- Confirmation/invoicing and PayFast return/cancel flow.
- Direct-link refresh on staff, quote and invoice pages.

AWS deployment, DNS, hosted authentication changes and authenticated workflow verification are not performed by this repository preparation.

## Local development

```sh
bun install --frozen-lockfile
bun run dev
bun run test
```
