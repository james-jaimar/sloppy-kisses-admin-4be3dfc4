// Accept or cancel a quote the customer saved from the portal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const j = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const BodySchema = z.object({
  quote_id: z.string().uuid(),
  action: z.enum(["accept", "cancel"]),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return j(401, { error: "not_authenticated" });

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: userRes, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userRes?.user) return j(401, { error: "not_authenticated" });

  let raw: unknown;
  try { raw = await req.json(); } catch { return j(400, { error: "bad_json" }); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return j(400, { error: "invalid_request" });
  const { quote_id, action } = parsed.data;

  const { data: profile } = await admin
    .from("profiles").select("id").eq("auth_user_id", userRes.user.id).maybeSingle();
  if (!profile) return j(403, { error: "no_profile" });

  const { data: customer } = await admin
    .from("customers").select("id, tenant_id")
    .eq("linked_profile_id", profile.id).eq("portal_access_enabled", true).maybeSingle();
  if (!customer) return j(403, { error: "forbidden" });

  const { data: est } = await admin
    .from("estimates")
    .select("id, status, booking_id, enrolment_id, customer_id, tenant_id, public_token, hold_expires_at")
    .eq("id", quote_id)
    .maybeSingle();
  if (!est || est.customer_id !== customer.id) return j(403, { error: "forbidden" });

  if (action === "cancel") {
    if (est.booking_id || est.enrolment_id) {
      return j(200, { ok: false, error: "This quote has already been accepted." });
    }
    const { error } = await admin
      .from("estimates")
      .update({ status: "cancelled", declined_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", est.id);
    if (error) return j(200, { ok: false, error: error.message });
    return j(200, { ok: true });
  }

  if (est.booking_id) return j(200, { ok: true, booking_id: est.booking_id });
  if (est.enrolment_id) return j(200, { ok: true, enrolment_id: est.enrolment_id });
  if (est.status !== "sent") return j(200, { ok: false, error: "This quote is no longer available." });
  if (est.hold_expires_at && new Date(est.hold_expires_at).getTime() <= Date.now()) {
    return j(200, { ok: false, error: "This quote has expired — please start a new booking." });
  }

  const { data, error } = await admin.rpc("accept_public_quote", { p_token: est.public_token });
  if (error) return j(200, { ok: false, error: error.message });
  const res = (data ?? {}) as any;
  if (!res.ok) return j(200, { ok: false, error: res.error ?? "Could not accept this quote" });

  return j(200, {
    ok: true,
    booking_id: res.booking_id ?? null,
    enrolment_id: res.enrolment_id ?? null,
    invoice_number: res.invoice_number ?? null,
    invoice_token: res.invoice_token ?? null,
  });
});
