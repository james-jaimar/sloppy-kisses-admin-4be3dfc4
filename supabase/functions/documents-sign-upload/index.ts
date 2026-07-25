// Return a signed S3 PUT URL for a new document upload.
// - Caller must be signed in.
// - For portal callers: pet_id must belong to their customer, or customer_id must be theirs.
// - Creates a `documents` row in status 'pending' with s3_key/bucket set.
// - Returns { document_id, upload_url, method, expires_in, s3_key }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signStorageUrl, buildObjectKey, S3_BUCKET_HINT } from "../_shared/s3.ts";

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

  let body: {
    tenant_id?: string;
    pet_id?: string | null;
    customer_id?: string | null;
    file_name?: string;
    content_type?: string;
    size_bytes?: number;
    type?: string;
    uploaded_via?: "portal" | "admin";
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const tenantId = body.tenant_id;
  if (!tenantId) return json(400, { error: "tenant_id required" });
  if (!body.file_name) return json(400, { error: "file_name required" });
  if (!body.type) return json(400, { error: "type required" });

  // Enforce max upload size from tenant settings (default 20MB).
  const { data: settings } = await admin
    .from("document_settings")
    .select("max_upload_mb")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const maxMb = Number(settings?.max_upload_mb ?? 20);
  if (body.size_bytes && body.size_bytes > maxMb * 1024 * 1024) {
    return json(413, { error: `File exceeds ${maxMb}MB limit` });
  }

  // Create the pending row using caller's credentials — RLS enforces access.
  const insert = await asCaller
    .from("documents")
    .insert({
      tenant_id: tenantId,
      pet_id: body.pet_id ?? null,
      customer_id: body.customer_id ?? null,
      type: body.type,
      file_name: body.file_name,
      content_type: body.content_type ?? null,
      size_bytes: body.size_bytes ?? null,
      storage_provider: "s3",
      s3_bucket: S3_BUCKET_HINT,
      status: "pending",
      uploaded_via: body.uploaded_via ?? "admin",
    })
    .select("id")
    .single();
  if (insert.error) return json(403, { error: insert.error.message });

  const docId = insert.data.id as string;
  const key = buildObjectKey({
    tenantId,
    petId: body.pet_id ?? null,
    customerId: body.customer_id ?? null,
    docId,
    fileName: body.file_name,
  });

  // Persist the key (service role — the row exists and belongs to caller).
  await admin.from("documents").update({ s3_key: key }).eq("id", docId);

  try {
    const signed = await signStorageUrl(key, "write");
    return json(200, {
      document_id: docId,
      s3_key: key,
      upload_url: signed.url,
      method: signed.method,
      expires_in: signed.expires_in,
    });
  } catch (e) {
    // Roll back the pending row so we don't leave orphans.
    await admin.from("documents").delete().eq("id", docId);
    return json(502, { error: (e as Error).message });
  }
});