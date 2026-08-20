import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response("Branding unavailable", { status: 503, headers: corsHeaders });
  }

  const tenantId = new URL(req.url).searchParams.get("tenant");
  if (!tenantId || !UUID.test(tenantId)) {
    return new Response("Invalid tenant", { status: 400, headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("logo_url")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantError || !tenant?.logo_url) {
    return new Response("Logo not found", { status: 404, headers: corsHeaders });
  }

  let logoResponse: Response;
  if (/^https:\/\//i.test(tenant.logo_url)) {
    logoResponse = await fetch(tenant.logo_url);
  } else {
    const { data, error } = await admin.storage.from("tenant-branding").download(tenant.logo_url);
    if (error || !data) {
      console.error("public brand logo download failed", { tenantId, message: error?.message });
      return new Response("Logo not found", { status: 404, headers: corsHeaders });
    }
    logoResponse = new Response(data, { headers: { "Content-Type": data.type || "image/png" } });
  }

  if (!logoResponse.ok) {
    console.error("public brand logo fetch failed", { tenantId, status: logoResponse.status });
    return new Response("Logo not found", { status: 404, headers: corsHeaders });
  }

  const contentType = logoResponse.headers.get("content-type")?.split(";")[0] ?? "";
  if (!contentType.startsWith("image/")) {
    console.error("public brand logo rejected non-image", { tenantId, contentType });
    return new Response("Invalid logo", { status: 415, headers: corsHeaders });
  }

  return new Response(await logoResponse.arrayBuffer(), {
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
});