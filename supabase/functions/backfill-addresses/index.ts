// Backfill customer_addresses with Google Place IDs and coordinates.
// Staff-only. Idempotent — skips rows that already have a google_place_id.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { GEOCODE_HOST, serverKey, googleError } from "../_shared/google.ts";

const BATCH_SIZE = 25;

interface BackfillResult {
  processed: number;
  updated: number;
  failed: number;
  errors: string[];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocodeOne(addressText: string): Promise<{ place_id: string; formatted_address: string; lat: number; lng: number } | null> {
  const res = await fetch(`${GEOCODE_HOST}/maps/api/geocode/json?address=${encodeURIComponent(addressText)}&key=${serverKey()}&region=ZA`, {
    method: "GET",
  });
  if (!res.ok) throw await googleError(res, "Geocoding");
  const json = await res.json();
  const result = json?.results?.[0];
  if (!result) return null;
  return {
    place_id: result.place_id,
    formatted_address: result.formatted_address,
    lat: result.geometry?.location?.lat,
    lng: result.geometry?.location?.lng,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

  // Staff-only gate: require tenant membership and a staff/platform profile.
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type, tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile || profile.user_type === "customer") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tenantId = profile.tenant_id;
  if (!tenantId) {
    return new Response(JSON.stringify({ error: "no tenant" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result: BackfillResult = { processed: 0, updated: 0, failed: 0, errors: [] };

  try {
    const { data: rows, error: fetchError } = await supabase
      .from("customer_addresses")
      .select("id, formatted_address, address_line_1, suburb, city, province, postcode, country_code")
      .eq("tenant_id", tenantId)
      .or("google_place_id.is.null,google_place_id.eq.''")
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;

    for (const row of rows ?? []) {
      result.processed++;
      const text =
        row.formatted_address ||
        [row.address_line_1, row.suburb, row.city, row.province, row.postcode, row.country_code === "ZA" ? "South Africa" : row.country_code]
          .filter(Boolean)
          .join(", ");
      if (!text || text.length < 5) {
        result.failed++;
        result.errors.push(`${row.id}: address text too short`);
        continue;
      }

      try {
        const match = await geocodeOne(text);
        if (!match) {
          result.failed++;
          result.errors.push(`${row.id}: no geocode result for "${text}"`);
          continue;
        }
        const { error: updError } = await supabase
          .from("customer_addresses")
          .update({
            google_place_id: match.place_id,
            latitude: match.lat,
            longitude: match.lng,
            formatted_address: match.formatted_address,
          })
          .eq("id", row.id);
        if (updError) throw updError;
        result.updated++;
        await sleep(40); // ~25 calls/second gentle pacing
      } catch (e) {
        result.failed++;
        result.errors.push(`${row.id}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, result }, null, 2), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, result }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
