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
  /** Rows still awaiting verification after this batch (excluding known failures). */
  remaining: number;
  totals: { total: number; verified: number; unverified: number; failedFlagged: number };
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

  let body: { address_id?: string; retry_failures?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const result: BackfillResult = {
    processed: 0,
    updated: 0,
    failed: 0,
    errors: [],
    remaining: 0,
    totals: { total: 0, verified: 0, unverified: 0, failedFlagged: 0 },
  };

  try {
    let query = supabase
      .from("customer_addresses")
      .select("id, formatted_address, address_line_1, suburb, city, province, postcode, country_code")
      .eq("tenant_id", tenantId);

    if (body.address_id) {
      query = query.eq("id", body.address_id).limit(1);
    } else {
      query = query.or("google_place_id.is.null,google_place_id.eq.''");
      if (!body.retry_failures) query = query.is("verification_failed_at", null);
      query = query.limit(BATCH_SIZE);
    }

    const { data: rows, error: fetchError } = await query;

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
        await supabase
          .from("customer_addresses")
          .update({ verification_failed_at: new Date().toISOString(), verification_error: "Address text too short" })
          .eq("id", row.id);
        continue;
      }

      try {
        const match = await geocodeOne(text);
        if (!match) {
          result.failed++;
          result.errors.push(`${row.id}: no geocode result for "${text}"`);
          await supabase
            .from("customer_addresses")
            .update({
              verification_failed_at: new Date().toISOString(),
              verification_error: `No Google match for "${text}"`,
            })
            .eq("id", row.id);
          continue;
        }
        const { error: updError } = await supabase
          .from("customer_addresses")
          .update({
            google_place_id: match.place_id,
            latitude: match.lat,
            longitude: match.lng,
            formatted_address: match.formatted_address,
            verification_failed_at: null,
            verification_error: null,
          })
          .eq("id", row.id);
        if (updError) throw updError;
        result.updated++;
        await sleep(40); // ~25 calls/second gentle pacing
      } catch (e) {
        result.failed++;
        result.errors.push(`${row.id}: ${(e as Error).message}`);
        await supabase
          .from("customer_addresses")
          .update({
            verification_failed_at: new Date().toISOString(),
            verification_error: (e as Error).message.slice(0, 400),
          })
          .eq("id", row.id);
      }
    }

    // Fresh totals so the caller can drive a progress bar / loop.
    const countOf = async (build: (q: any) => any) => {
      const { count } = await build(
        supabase.from("customer_addresses").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      );
      return count ?? 0;
    };
    result.totals.total = await countOf((q: any) => q);
    result.totals.verified = await countOf((q: any) => q.not("google_place_id", "is", null));
    result.totals.unverified = await countOf((q: any) => q.is("google_place_id", null));
    result.totals.failedFlagged = await countOf((q: any) =>
      q.is("google_place_id", null).not("verification_failed_at", "is", null),
    );
    result.remaining = result.totals.unverified - result.totals.failedFlagged;
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
