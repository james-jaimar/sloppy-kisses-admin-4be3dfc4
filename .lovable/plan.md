## Goal

Enable password management end-to-end for Sloppy Kisses:
1. James sets his own password manually in Supabase now (temporary).
2. Any user can request a password reset from the login page.
3. Any signed-in user can change their password from inside the app.
4. All password emails go through **your** SMTP (configured on the Supabase project), not Supabase's default sender — so the "from" address, branding, and deliverability are yours.

We keep the existing React + Vite + TypeScript architecture and current visual design. No new tables, no schema changes.

---

## Part A — One-time setup you do in the Supabase dashboard

These steps are outside the codebase; I'll guide you but can't do them for you.

1. **Set James's initial password**
   - Supabase Dashboard → Authentication → Users → `james@jaimar.dev` → "Send password recovery" *or* "Reset password" and set a temp password.
   - You'll then be able to sign in at `/login` and (once shipped) change it from the app.

2. **Configure custom SMTP** (so emails come from your domain, not Supabase)
   - Dashboard → Project Settings → Authentication → **SMTP Settings** → Enable custom SMTP.
   - Fill in: SMTP host, port, username, password, sender name, sender email (e.g. `no-reply@sloppykisses.co` or whichever domain you'll use).
   - Make sure that sending domain has SPF/DKIM set up with your SMTP provider so mail doesn't land in spam.
   - Save. From that point on, Supabase Auth uses your SMTP for every password reset / confirmation / magic link email — same flow, your sender.

3. **Configure redirect URLs** (so reset links land on our page and not on Supabase's default)
   - Dashboard → Authentication → URL Configuration
     - **Site URL:** the production URL (later: `https://document-centre.com`; for now the Lovable preview URL is fine).
     - **Additional Redirect URLs:** add
       - `http://localhost:8080/reset-password`
       - `https://id-preview--cf3d2f8a-678a-4ce0-bb85-8cad57de8703.lovable.app/reset-password`
       - the eventual production URL + `/reset-password`
   - Without these, Supabase strips the `redirectTo` we send and the reset link won't reach `/reset-password`.

4. **(Optional) Customize the email body**
   - Dashboard → Authentication → Email Templates → "Reset Password". Edit HTML + subject to match Sloppy Kisses branding. The `{{ .ConfirmationURL }}` placeholder is what points at `/reset-password`.

Once A2 is done, all password emails already originate from your SMTP — no code change needed to switch senders.

---

## Part B — Code changes I'll make

All changes are frontend-only. No DB migration, no edge functions.

### 1. Public `/forgot-password` page
- New file: `src/pages/ForgotPassword.tsx`
- Simple form: email input → calls
  ```ts
  supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  ```
- Loading / success / error states (always shows generic "If that email exists, we've sent a link" to avoid account enumeration).
- Styled to match the existing `Login` card.

### 2. Public `/reset-password` page
- New file: `src/pages/ResetPassword.tsx`
- Public route (not behind `RequireAdmin` / `RequireCustomer`).
- On mount: detects the `type=recovery` session Supabase creates when the user clicks the email link (`onAuthStateChange` fires with a temporary session).
- Shows: new password + confirm password fields.
- Calls `supabase.auth.updateUser({ password })`, then signs the user out and redirects to `/login` with a success toast (safer than auto-logging in).
- Handles the "link expired / invalid" case with a clear message + link back to `/forgot-password`.

### 3. "Forgot your password?" link on `/login`
- Edit `src/pages/Login.tsx` to add a small link under the password field pointing to `/forgot-password`.
- Purely additive; no visual redesign.

### 4. In-app "Change password" screen (for signed-in users)
- New file: `src/features/settings/ChangePasswordPage.tsx`
- Route: `/admin/settings/password` (admin) and `/customer/profile/password` (customer portal).
- Fields: current password, new password, confirm new password.
- Flow: re-verifies the current password by calling `supabase.auth.signInWithPassword({ email: authUser.email, password: current })`, then `supabase.auth.updateUser({ password: next })`.
- On success: toast + optional sign-out (configurable; default keeps the session).
- Adds a menu entry in `AppHeader` user dropdown ("Change password") pointing to the right route based on which shell the user is in.

### 5. Router wiring
- `src/App.tsx`:
  - Add public routes `/forgot-password` and `/reset-password` (siblings of `/login`, outside the `RequireAdmin` / `RequireCustomer` guards).
  - Add `/admin/settings/password` inside `RequireAdmin` + `AdminLayout`.
  - Add `/customer/profile/password` inside `RequireCustomer` + `CustomerLayout`.

### 6. No Supabase schema changes
- No new tables, no new policies, no edge function. Supabase Auth handles everything; our app just calls its SDK and Supabase relays the email via **your** SMTP.

---

## What "custom email from the app, not Supabase" means here

Two possible interpretations — I'm going with the one that matches "use the SMTP settings in Supabase":

- **Chosen: custom SMTP.** Supabase still triggers the email, but delivers it through your SMTP server, so it's *from your domain*, styled by your template, and Supabase's name is nowhere in it. This is the standard, low-risk path and is what your answer selected.
- Not chosen: fully custom edge-function sender via an "auth email hook". That path exists but requires Lovable-managed Cloud (this project uses your own Supabase), so it's not available here. If you ever want to move to fully code-controlled emails (e.g. via Resend from an edge function), we'd revisit.

---

## Out of scope (explicit)

- No changes to customers/bookings/invoices/daycare wiring.
- No changes to tenant/permission logic.
- No visual redesign of existing pages.
- No new database tables or RLS changes.

---

## After you approve

I'll implement Part B in one pass. You handle Part A in the Supabase dashboard (I'll re-list the exact clicks in chat when we ship). Then we test with james@jaimar.dev end-to-end.
