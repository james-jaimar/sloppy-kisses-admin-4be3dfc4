// Called by the browser after the S3 PUT succeeds.
// Flips the row from status='pending' to 'uploaded' and stores size/checksum.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { headObject } from "../_shared/s3.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: userRes } = await asCaller.auth.getUser();
  if (!userRes?.user) return json(401, { error: "Not authenticated" });

  let body: { document_id?: string; client_size_bytes?: number; client_content_type?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  if (!body.document_id) return json(400, { error: "document_id required" });

  // Verify caller can read the row (RLS).
  const doc = await asCaller
    .from("documents")
    .select("id, s3_key")
    .eq("id", body.document_id)
    .maybeSingle();
  if (doc.error) return json(403, { error: doc.error.message });
  if (!doc.data?.s3_key) return json(404, { error: "Document not found" });

  let size: number | null = null;
  let etag: string | null = null;
  let contentType: string | null = null;
  try {
    const head = await headObject(doc.data.s3_key);
    size = head.size;
    etag = head.etag;
    contentType = head.contentType;
  } catch (err) {
    // The browser already confirmed a successful S3 PUT. A failing HEAD (gateway
    // hiccup, missing permission, eventual consistency) must not leave the row
    // stuck in `pending` — fall back to the client-reported metadata.
    console.error("headObject failed", doc.data.s3_key, String(err));
    size = typeof body.client_size_bytes === "number" ? body.client_size_bytes : null;
    contentType = body.client_content_type ?? null;
  }

  const upd = await admin
    .from("documents")
    .update({
      status: "uploaded",
      size_bytes: size,
      checksum: etag,
      content_type: contentType,
    })
    .eq("id", body.document_id);
  if (upd.error) {
    console.error("confirm update failed", upd.error.message);
    return json(500, { error: upd.error.message });
  }

  return json(200, { ok: true, size_bytes: size });
});