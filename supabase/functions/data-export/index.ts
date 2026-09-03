// Temporary admin data export used for the Xero customer reconciliation dump.
// Protected by DATA_EXPORT_TOKEN; returns paged JSON for whitelisted tables.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED = new Set([
  "customers",
  "pets",
  "customer_addresses",
  "emergency_contacts",
  "vets",
]);

Deno.serve(async (req) => {
  const token = req.headers.get("x-export-token");
  if (!token || token !== Deno.env.get("DATA_EXPORT_TOKEN")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const url = new URL(req.url);
  const table = url.searchParams.get("table") ?? "";
  if (!ALLOWED.has(table)) {
    return new Response(JSON.stringify({ error: "table not allowed" }), { status: 400 });
  }
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), 1000);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await admin
    .from(table)
    .select("*")
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ rows: data ?? [] }), {
    headers: { "Content-Type": "application/json" },
  });
});
