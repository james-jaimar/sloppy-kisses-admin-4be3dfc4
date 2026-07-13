Correction to the previous hand-off — the code changes already shipped are correct and unchanged; only the two manual steps I gave you were wrong (they referenced the wrong domain).

## Correct manual steps for Sloppy Kisses

1. **Settings → Branding → Public app URL**: set to `https://sloppykisses.jaimar.dev` and save.
2. **Supabase Dashboard → Auth → URL Configuration**: ensure `https://sloppykisses.jaimar.dev` is in the redirect allow-list, otherwise `verifyOtp` will reject invite/reset tokens.

## Memory fix

Also update the cross-user memory note that says "production domain is document-centre.com" so it doesn't bleed into this project again. That note belongs to a different project and shouldn't be treated as global.

No code, migration, or edge-function changes needed.