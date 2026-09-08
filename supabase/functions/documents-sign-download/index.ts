// Return a signed S3 GET URL for a document the caller may read.
// RLS on `documents` decides who may see the row; if the select succeeds we
// sign a short-lived URL via the gateway.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signStorageUrl } from "../_shared/s3.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json(401, { error: "Missing Authorization header" });

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await asCaller.auth.getUser();
  if (!userRes?.user) return json(401, { error: "Not authenticated" });

  let body: { document_id?: string; document_ids?: string[] };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }

  // Batch mode: sign several documents at once (pet photo thumbnails in lists).
  if (Array.isArray(body.document_ids)) {
    const ids = body.document_ids.filter(Boolean).slice(0, 200);
    if (ids.length === 0) return json(200, { urls: [] });
    const rows = await asCaller
      .from("documents")
      .select("id, s3_key, storage_provider")
      .in("id", ids);
    if (rows.error) return json(403, { error: rows.error.message });
    const urls: { id: string; download_url: string }[] = [];
    for (const r of rows.data ?? []) {
      if (r.storage_provider !== "s3" || !r.s3_key) continue;
      try {
        const signed = await signStorageUrl(r.s3_key, "read");
        urls.push({ id: r.id, download_url: signed.url });
      } catch { /* skip unsignable */ }
    }
    return json(200, { urls });
  }

  if (!body.document_id) return json(400, { error: "document_id required" });


  const doc = await asCaller
    .from("documents")
    .select("id, s3_key, storage_provider, file_name")
    .eq("id", body.document_id)
    .maybeSingle();
  if (doc.error) return json(403, { error: doc.error.message });
  if (!doc.data) return json(404, { error: "Not found" });
  if (doc.data.storage_provider !== "s3" || !doc.data.s3_key) {
    return json(400, { error: "Document is not stored on S3" });
  }

  try {
    const signed = await signStorageUrl(doc.data.s3_key, "read");
    return json(200, {
      download_url: signed.url,
      expires_in: signed.expires_in,
      file_name: doc.data.file_name,
    });
  } catch (e) {
    return json(502, { error: (e as Error).message });
  }
});