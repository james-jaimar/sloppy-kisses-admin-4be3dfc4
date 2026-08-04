# Fix: Xero sync edge function crashes on every call

## What's happening

Every call to the Xero sync function (Load organisations, Test connection, Push, Run queue) fails before it does any work. The browser only sees "Failed to send a request to the Edge Function", but the function logs show the real cause:

```text
TypeError: asUser.auth.getClaims is not a function
```

The function checks who is calling by asking the Supabase client library for the sign-in token's claims. It uses `auth.getClaims()`, which does not exist in the version of the Supabase library the function imports (`@supabase/supabase-js@2.45.0`). So the request dies at the permission check, before Xero is ever contacted.

Confirmed by reading `supabase/functions/xero-sync/index.ts` line 310 and the function's error logs.

## The fix

In `supabase/functions/xero-sync/index.ts`, replace the unsupported claims call with the supported `auth.getUser(token)` call (the same pattern already used successfully in `supabase/functions/send-invoice-email/index.ts` line 67), then take the user id from the returned user instead of `claims.sub`. Everything after that — profile lookup, `settings.xero.manage` permission check, service-role bypass — stays exactly as it is.

Then redeploy the function and verify by calling it directly with the "connections" action, checking the logs are clean, and confirming "Load organisations" and "Test connection" work on the Xero settings screen.

## Technical detail

- File: `supabase/functions/xero-sync/index.ts`, lines 309-312.
- Change `const { data: claims } = await asUser.auth.getClaims(token)` to `const { data: { user } = {} , error } = await asUser.auth.getUser(token)`; use `user.id` as `userId`; keep the 401 return when there is no user.
- No database migration, no frontend change, no change to the Xero gateway helper.
