// Temporary staging loader for the Xero customer cleanup import.
// Token-protected; writes only to the three xero_import_* staging tables.
// Delete this function (and DATA_IMPORT_TOKEN) once the import is committed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED = new Set([
  "xero_import_customers",
  "xero_import_pets",
  "xero_import_addresses",
]);

Deno.serve(async (req) => {
  if (req.headers.get("x-import-token") !== Deno.env.get("DATA_IMPORT_TOKEN")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const table = body?.table as string | undefined;
  const rows = body?.rows as Record<string, unknown>[] | undefined;
  if (!table || !ALLOWED.has(table) || !Array.isArray(rows)) {
    return new Response(JSON.stringify({ error: "bad request" }), { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error, count } = await admin.from(table).insert(rows, { count: "exact" });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ inserted: count ?? rows.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
