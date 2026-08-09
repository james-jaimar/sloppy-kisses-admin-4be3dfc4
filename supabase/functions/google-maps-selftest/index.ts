// Verifies the project's own Google Cloud setup end to end:
//   1. Routes API via the server API key
//   2. Route Optimization via the routing service account (OAuth)
// Returns a pass/fail line per check with Google's raw error text on failure.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { computeRouteMatrix, optimizeTours, projectId, rfc3339Seconds } from "../_shared/google.ts";

// Two real Bryanston points (Nicolway and Bryanston shopping precinct).
const A = { latitude: -26.0431, longitude: 28.0212 };
const B = { latitude: -26.0567, longitude: 28.0348 };

interface Check { name: string; ok: boolean; detail: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Staff-only: require a signed-in user.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const checks: Check[] = [];

  // 0. Secrets present
  for (const name of ["GOOGLE_MAPS_SERVER_KEY", "GOOGLE_API_KEY", "GOOGLE_ROUTING_SA_JSON", "GOOGLE_CLOUD_PROJECT_ID"]) {
    checks.push({
      name: `secret ${name}`,
      ok: Boolean(Deno.env.get(name)),
      detail: Deno.env.get(name) ? "configured" : "not set",
    });
  }

  // 1. Routes API with the server key
  try {
    const rows = await computeRouteMatrix([A], [B]);
    const first: any = Array.isArray(rows) ? rows[0] : rows;
    checks.push({
      name: "Routes API (computeRouteMatrix)",
      ok: true,
      detail: `Bryanston A→B: ${first?.duration ?? "?"} , ${first?.distanceMeters ?? "?"} m`,
    });
  } catch (e) {
    checks.push({ name: "Routes API (computeRouteMatrix)", ok: false, detail: String((e as Error).message) });
  }

  // 2. Route Optimization with the service account
  try {
    const res = await optimizeTours({
      shipments: [
        { deliveries: [{ arrivalLocation: A, duration: "3600s" }] },
        { deliveries: [{ arrivalLocation: B, duration: "3600s" }] },
      ],
      vehicles: [{ startLocation: A, endLocation: A, costPerKilometer: 1 }],
      // Route Optimization rejects sub-second precision on these timestamps.
      globalStartTime: rfc3339Seconds(Date.now() + 3600_000),
      globalEndTime: rfc3339Seconds(Date.now() + 12 * 3600_000),
    });
    const visits = res?.routes?.[0]?.visits?.length ?? 0;
    checks.push({
      name: "Route Optimization (optimizeTours)",
      ok: true,
      detail: `project ${projectId()} — solver returned ${visits} visit(s), ${res?.skippedShipments?.length ?? 0} skipped`,
    });
  } catch (e) {
    checks.push({ name: "Route Optimization (optimizeTours)", ok: false, detail: String((e as Error).message) });
  }

  const allOk = checks.every((c) => c.ok);
  return new Response(JSON.stringify({ ok: allOk, checks }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});