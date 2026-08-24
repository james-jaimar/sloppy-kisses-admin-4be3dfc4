// One-off importer: accepts a product photo keyed by Xero item code
// (products.external_code), stores it in the product-images bucket and
// points products.image_url at it. Protected by a shared token.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-import-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IMPORT_TOKEN = Deno.env.get("PRODUCT_IMAGE_IMPORT_TOKEN") ?? "";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!IMPORT_TOKEN || req.headers.get("x-import-token") !== IMPORT_TOKEN) {
    return json(401, { error: "Bad import token" });
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return json(400, { error: "Expected multipart/form-data" }); }

  const code = String(form.get("code") ?? "").trim();
  const file = form.get("file") as File | null;
  if (!code) return json(400, { error: "code required" });
  if (!file) return json(400, { error: "file required" });
  if (file.size > 5 * 1024 * 1024) return json(413, { error: "file too large" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: product, error: findErr } = await admin
    .from("products")
    .select("id, tenant_id, image_url")
    .ilike("external_code", code)
    .maybeSingle();
  if (findErr) return json(500, { error: findErr.message });
  if (!product) return json(404, { error: "no product for code", code });

  const path = `${product.tenant_id}/${product.id}.jpg`;
  const up = await admin.storage.from("product-images").upload(path, await file.arrayBuffer(), {
    upsert: true,
    contentType: "image/jpeg",
    cacheControl: "3600",
  });
  if (up.error) return json(502, { error: up.error.message });

  const upd = await admin.from("products").update({ image_url: path }).eq("id", product.id);
  if (upd.error) return json(500, { error: upd.error.message });

  return json(200, { product_id: product.id, path });
});
