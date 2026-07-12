
## What this delivers

Three related fixes on top of the auth-email work that's already in place:

1. **Full CRUD on users** — remove a user from the tenant, and resend their invite email.
2. **Full CRUD on roles & role permissions** — create/rename/delete custom roles and tick permissions on/off from the matrix (system roles stay locked).
3. **Customer comms use tenant SMTP** — the `send-notifications` dispatcher stops using Resend and sends via the same `email_transport_settings` (mail.jaimar.dev) that auth emails already use.

---

## 1. Users page — Resend invite + Remove

**UI (`src/features/users/UsersPage.tsx`)**
- Add two extra buttons per row: **Resend invite** (only when the user has never signed in, i.e. no `auth_user_id` linkage / status `invited`) and **Remove** (with confirm dialog).
- Wire toasts + optimistic refetch.

**Edge functions**
- Extend `invite-user` to accept `mode: "resend"`: skips profile/tenant_user creation and calls `admin.auth.admin.inviteUserByEmail` again with the same metadata. Uses the same permission gate (`users.manage`).
- New `remove-tenant-user` edge function:
  - Checks caller `users.manage`.
  - Deletes `user_roles` for the tenant_user, then the `tenant_users` row.
  - Leaves the auth user + profile intact (they may belong to other tenants). Returns `{ok:true}`.

**Client (`src/features/users/queries.ts`)**
- Add `resendInvite({tenantId,email})` and `useRemoveTenantUser(tenantId)` wrappers.

## 2. Roles & permissions — writable

**UI (`src/features/settings/RolesPermissionsPage.tsx`)**
- Header gains **New role** button (only when caller has `roles.manage`).
- Each column header for a **non-system** role becomes editable: rename, delete (with confirm), and each checkmark cell becomes a toggle.
- System roles (`is_system_role = true`, e.g. `owner`, `admin`, `customer`, `platform_owner`) stay read-only with a lock icon and a tooltip.

**Client queries**
- Add mutations in `src/features/users/queries.ts`:
  - `useCreateRole(tenantId)` → insert into `roles` with `tenant_id` = current tenant, `is_system_role=false`.
  - `useUpdateRole` → update label/description.
  - `useDeleteRole` → delete role (cascade drops `role_permissions` + `user_roles`).
  - `useToggleRolePermission` → insert/delete `role_permissions` row.

**DB migration**
- Add `roles.manage` and `roles.view` permission rows if missing; grant to `owner` + `admin` in `role_permissions`.
- Add RLS policies on `roles` and `role_permissions` so users with `users.manage` (or new `roles.manage`) in the tenant can INSERT/UPDATE/DELETE non-system rows. System roles remain locked via a `WITH CHECK (is_system_role = false)` guard. Confirm existing `GRANT`s on both tables cover `authenticated`; add them if not.

## 3. Customer comms → tenant SMTP

**`supabase/functions/send-notifications/index.ts`**
- Drop the Resend branch. Load the tenant's row from `email_transport_settings` (same shape used by `auth-email-hook`).
- Send via `denomailer` `SMTPClient` with the tenant's host/port/secure/username/password and `from_name`/`from_email`.
- On success write `status='sent'`, `provider_message_id=null` (SMTP has no id), keep the existing `body_rendered`/`recipient_email` fields.
- On missing transport → mark event `failed` with a clear error ("SMTP not configured — Settings → Email Server"). Don't silently skip.
- Also insert a row into `email_log` (template_code = `notify.<event_type>`) so the new **Auth emails** tab work extends naturally: rename that tab **Email log** and show both `auth.*` and `notify.*` prefixes, filtered by type chip.

**Comms page (`src/features/comms/CommsInboxPage.tsx` + `queries.ts`)**
- Rename the tab I added last turn from "Auth emails" to **Email log**.
- Broaden `useAuthEmailLog` to `useEmailLog` (no `template_code` prefix filter), with a small filter dropdown: All / Auth / Notifications.

---

## Technical notes

- No changes to `notification_events` schema — only the dispatcher swaps transport.
- Removing a tenant_user does NOT delete `auth.users`; that stays platform-owner territory.
- Resend invite is safe to call repeatedly (Supabase generates a fresh token each time).
- Roles CRUD respects `is_system_role`; system roles cannot be renamed or deleted from the UI or the RLS policies.
- `RESEND_API_KEY` becomes unused after this change — I'll leave the secret alone (harmless) and note it in the response.

## Out of scope
- Deleting the underlying auth user (that would break other tenants they might belong to). If you want a "hard delete across platform", say so and I'll add it under Platform → Users.
- WhatsApp/SMS provider — still stubbed. Ping me when you pick one (Twilio, Meta Cloud API, etc.) and I'll wire it.
