Phase 10 (Retail / Shop & Stock) is done. Two natural next steps remain on the roadmap. My recommendation is **Phase 12 — Users & Roles first**, then Phase 11 — Reports.

## Why Users & Roles before Reports

You're close to real go-live. Right now every signed-in staff member effectively has full operator access — a groomer can edit invoices, a driver can change vaccination rules, reception can delete customers. Locking that down is cheap now and painful later (every new screen we add without gates is another screen we'll have to retrofit). Reports are more valuable once real data is flowing, so they naturally sit after roles.

## Phase 12 — Users & Roles

### What we'll build

1. **Roles model** (owner, manager, groomer, driver, reception) stored in a dedicated `user_roles` table (never on profiles — privilege-escalation risk). Uses a `has_role()` SECURITY DEFINER function so RLS never recurses.
2. **Permission codes** — a small, named set (e.g. `bookings.write`, `invoices.write`, `invoices.void`, `retail.sell`, `retail.manage`, `comms.send`, `settings.manage`, `users.manage`, `reports.view`). Each role maps to a set of codes in one place (`src/lib/permissions/permissions.ts`, which already exists as a stub).
3. **Admin → Users & Roles screen** (`/admin/users`, currently a placeholder):
   - List staff for the tenant with role chips, last sign-in, active toggle.
   - Invite user (email → creates auth user + `tenant_members` row + default role).
   - Edit roles (multi-select), deactivate, resend invite, reset password.
4. **Settings → Roles & permissions** (settings-first rule): read-only matrix showing which permission codes each role has, plus a "custom overrides" table per user for the rare exception. Owner-only.
5. **UI gating** via a `<Can code="...">` component + `usePermission()` hook:
   - Hide/disable action buttons (New booking, Void invoice, Record payment, Send message, Adjust stock, Quick sale, Settings links).
   - Sidebar items filtered by permission (driver sees Transport + Calendar; groomer sees Grooming + Pets; reception sees Bookings + Customers + Invoices; manager sees most; owner sees all).
   - Route guards on sensitive pages (`RequireAdmin` extended with an optional `code` prop, or a new `RequirePermission`).
6. **RLS tightening** — where a role shouldn't even read data (e.g. driver shouldn't see invoice totals), policies use `has_role()` alongside `user_has_tenant_access()`. Start conservative on the write side (only manager/owner can modify settings, invoices, users) and keep reads broad for now.
7. **Audit trail (light)** — a `user_role_changes` table so we can see who granted what and when. Owner-only view on the Users page.

### Data model

- `app_role` enum: `owner | manager | groomer | driver | reception`.
- `user_roles(id, user_id, tenant_id, role, created_at, created_by)` — unique on `(user_id, tenant_id, role)`.
- `user_role_changes(id, tenant_id, target_user_id, actor_user_id, action, role, at)`.
- `has_role(_user_id uuid, _tenant_id uuid, _role app_role) returns boolean` — SECURITY DEFINER, `search_path = public`.
- `has_permission(_user_id uuid, _tenant_id uuid, _code text) returns boolean` — resolves via role→code map (map lives in a small `role_permissions` reference table so we can tweak without a migration later).
- All new tables: full GRANTs, RLS on, owner/manager-only write, self-read for the current user.

### Files (planned)

- Migration: enum, `user_roles`, `role_permissions` (seeded), `user_role_changes`, `has_role`, `has_permission`, RLS + GRANTs.
- `src/lib/permissions/permissions.ts` — extend the existing stub with codes + role→codes seed (mirrors DB).
- `src/lib/permissions/usePermission.ts` + `<Can>` component.
- `src/components/auth/RequirePermission.tsx`.
- `src/features/users/UsersPage.tsx`, `InviteUserModal.tsx`, `EditUserRolesDrawer.tsx`, `queries.ts`.
- `src/features/settings/RolesPermissionsPage.tsx` (matrix, owner-only).
- Sidebar (`AppSidebar.tsx`) + action buttons across bookings/invoices/comms/shop — wrap in `<Can>`.

### Out of scope (deferred)

- Fully custom per-user permission editing (only role assignment + owner overrides for now).
- SSO / SAML.
- Per-resource permissions (e.g. "groomer X only sees their own bookings") — the schema supports it via `resources.assigned_user_id` later.
- Activity log beyond role changes.

### Verification

- Sign in as a `groomer` → sidebar shows Grooming + Pets + Calendar only; `/admin/invoices` redirects; "Record payment" button absent on a booking.
- Sign in as `reception` → can create bookings and record payments but "Void invoice" and Settings are hidden.
- Owner grants `invoices.void` override to a specific manager → that manager sees the Void button; other managers don't.
- Deactivating a user immediately blocks their next request (RLS check on `tenant_members.active`).
- RLS check: a `driver` querying `invoices` directly via the Supabase client returns 0 rows.

---

## Alternative: Phase 11 — Reports (if you'd rather do this first)

Dashboards for revenue (by service, by day/week/month), occupancy (hotel/cattery/daycare), groomer utilisation, comms delivery rates, aged debtors, low-stock + sales-by-day (already stubbed from Phase 10). Uses recharts + a handful of read-only SQL views. Roughly the same size as Users & Roles.

**Shall I proceed with Phase 12 — Users & Roles, or would you prefer Phase 11 — Reports?**