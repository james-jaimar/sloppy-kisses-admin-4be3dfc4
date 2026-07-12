// Public wrapper that resolves a share token to an invoice_id and
// re-invokes generate-invoice-pdf with the service role. Anonymous access:
// possession of the token is the authorisation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j(405, { error: "Method not allowed" });
  let body: any;
  try { body = await req.json(); } catch { return j(400, { error: "Invalid JSON" }); }
  const token: string | undefined = body?.token;
  if (!token) return j(400, { error: "token required" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: inv, error } = await admin
    .from("invoices").select("id, status").eq("public_view_token", token).maybeSingle();
  if (error) return j(500, { error: error.message });
  if (!inv || inv.status === "draft") return j(404, { error: "Invoice not found" });

  const pdfRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-invoice-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ invoice_id: inv.id }),
  });
  if (!pdfRes.ok) return j(502, { error: await pdfRes.text() });
  const bytes = new Uint8Array(await pdfRes.arrayBuffer());
  return new Response(bytes, {
    status: 200,
    headers: { ...cors, "Content-Type": "application/pdf" },
  });
});