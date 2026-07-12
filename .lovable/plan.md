## Fix invite-user enum error

**Root cause**: `supabase/functions/invite-user/index.ts` inserts a new profile with `user_type: "tenant"`, but the `user_type` enum only accepts `platform | staff | customer` (visible in `PlatformUsersPage.tsx`). Postgres rejects the insert → "invalid input value for enum user_type: 'tenant'".

**Change**: In `invite-user/index.ts`, change the new-profile insert to `user_type: "staff"` (the correct value for tenant team members being invited via the Users page).

No schema changes, no other files affected.