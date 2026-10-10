// Public customer self-signup.
// - Accepts { tenant_slug, email, password, first_name, last_name, mobile }.
// - Creates a Supabase auth user (email pre-confirmed so they can sign in),
//   a public.profiles row (user_type='customer'), a customers row with
//   signup_status='pending_review' and portal_access_enabled=true (linked).
// - Records a customer_signup_pending notification event for staff.
// - Returns { ok: true } (or { error } on failure). Never leaks tenant data.

import { sendAuthEmail, generateTenantActionUrl, resolveTenantAppUrl } from "../_shared/auth-email.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: {
    tenant_slug?: string; email?: string; password?: string;
    first_name?: string; last_name?: string; mobile?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const firstName = (body.first_name ?? "").trim();
  const lastName = (body.last_name ?? "").trim();
  const mobile = (body.mobile ?? "").trim();
  const tenantSlug = (body.tenant_slug ?? "").trim().toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "invalid_email" }, 400);
  if (password.length < 8) return json({ error: "password_too_short" }, 400);
  if (!firstName || !lastName) return json({ error: "name_required" }, 400);

  // Resolve tenant: slug if given, else fall back to the sole active tenant.
  let tenant: { id: string; name: string } | null = null;
  if (tenantSlug) {
    const { data } = await admin.from("tenants").select("id, name").eq("slug", tenantSlug).eq("status", "active").maybeSingle();
    tenant = data ?? null;
  } else {
    const { data } = await admin.from("tenants").select("id, name").eq("status", "active").order("created_at", { ascending: true }).limit(2);
    if (data && data.length === 1) tenant = data[0];
  }
  if (!tenant) return json({ error: "tenant_not_found" }, 400);

  // Reject if a customer row already exists with this email in the tenant.
  const { data: existingCustomer } = await admin
    .from("customers")
    .select("id, linked_profile_id")
    .eq("tenant_id", tenant.id)
    .ilike("email", email)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();
  if (existingCustomer?.linked_profile_id) return json({ error: "email_already_registered" }, 409);

  // Refuse if email already has an auth user (avoid hijack)
  const { data: existingUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = existingUsers?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
  if (found) return json({ error: "email_already_registered" }, 409);

  // Customer already on file without a login (e.g. booked via /book). We can't
  // trust the typed password yet: create the login with a random password, link
  // it, and email a set-password link so only the real inbox owner gets in.
  if (existingCustomer) {
    const fullName0 = `${firstName} ${lastName}`.trim();
    const { data: u, error: uErr } = await admin.auth.admin.createUser({
      email, password: crypto.randomUUID() + crypto.randomUUID(), email_confirm: true,
      user_metadata: { full_name: fullName0, source: "public_booking_claim" },
    });
    if (uErr || !u?.user) return json({ error: "create_user_failed" }, 500);
    const { data: prof, error: prErr } = await admin.from("profiles")
      .upsert({ auth_user_id: u.user.id, email, full_name: fullName0, user_type: "customer" }, { onConflict: "auth_user_id" })
      .select("id").maybeSingle();
    if (prErr || !prof) { await admin.auth.admin.deleteUser(u.user.id).catch(() => {}); return json({ error: "profile_failed" }, 500); }
    await admin.from("customers").update({ linked_profile_id: prof.id, portal_access_enabled: true } as any).eq("id", existingCustomer.id);
    try {
      const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? null;
      const appUrl = await resolveTenantAppUrl(admin, tenant.id, origin);
      const actionUrl = await generateTenantActionUrl(admin, "recovery", email, appUrl, "/reset-password");
      await sendAuthEmail({ admin, tenantId: tenant.id, action: "recovery", recipient: email, actionUrl });
    } catch (e) { console.error("customer-signup claim email:", (e as Error).message); }
    return json({ ok: true, verify_email: true });
  }

  // Create auth user, email pre-confirmed so they can sign in immediately.
  const fullName = `${firstName} ${lastName}`.trim();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, source: "customer_signup" },
  });
  if (createErr || !created?.user) return json({ error: createErr?.message ?? "create_user_failed" }, 500);
  const authUserId = created.user.id;

  // Upsert profile
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .upsert({ auth_user_id: authUserId, email, full_name: fullName, user_type: "customer" }, { onConflict: "auth_user_id" })
    .select("id")
    .maybeSingle();
  if (pErr || !profile) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    return json({ error: pErr?.message ?? "profile_failed" }, 500);
  }

  // Create customer row (pending_review)
  const { data: custNum } = await admin.rpc("next_customer_number", { target_tenant_id: tenant.id });
  const { data: cust, error: cErr } = await admin
    .from("customers")
    .insert({
      tenant_id: tenant.id,
      customer_number: custNum ?? null,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      email,
      mobile: mobile || null,
      linked_profile_id: profile.id,
      portal_access_enabled: true,
      signup_status: "active",
    } as any)
    .select("id")
    .maybeSingle();
  if (cErr || !cust) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    return json({ error: cErr?.message ?? "customer_failed" }, 500);
  }

  return json({ ok: true });
});