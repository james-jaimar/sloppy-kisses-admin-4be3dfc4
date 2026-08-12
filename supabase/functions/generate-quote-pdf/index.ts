// Branded PDF for a hotel quote (estimates row) — same layout as the invoice.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { renderQuotePdf } from "./render.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const jerr = (s: number, msg: string) =>
  new Response(JSON.stringify({ error: msg }), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jerr(405, "Method not allowed");
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return jerr(401, "Missing Authorization");

  const isServiceCall = auth.includes(SERVICE_KEY);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!isServiceCall) {
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: u } = await caller.auth.getUser();
    if (!u?.user) return jerr(401, "Not authenticated");
  }

  let body: any;
  try { body = await req.json(); } catch { return jerr(400, "Invalid JSON"); }
  const quoteId: string | undefined = body?.quote_id;
  if (!quoteId) return jerr(400, "quote_id required");

  const { data: q } = await admin.from("estimates").select("*").eq("id", quoteId).maybeSingle();
  if (!q) return jerr(404, "Quote not found");

  const [{ data: items }, { data: customer }, { data: settings }, { data: tenant }] = await Promise.all([
    admin.from("estimate_items").select("*").eq("estimate_id", quoteId).order("sort_order"),
    admin.from("customers")
      .select("id, full_name, customer_number, email, mobile, phone_alt, address_line_1, address_line_2, suburb, city, province, postcode")
      .eq("id", q.customer_id).maybeSingle(),
    admin.from("invoicing_settings").select("*").eq("tenant_id", q.tenant_id).maybeSingle(),
    admin.from("tenants").select("id, name, primary_colour, logo_url, contact_email, contact_phone").eq("id", q.tenant_id).maybeSingle(),
  ]);

  try {
    const bytes = await renderQuotePdf({ q, items: items ?? [], customer, settings, tenant, admin });
    return new Response(bytes, {
      headers: { ...cors, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${q.estimate_number ?? "quote"}.pdf"` },
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("generate-quote-pdf failed:", msg);
    return jerr(500, `PDF build failed: ${msg}`);
  }
});
