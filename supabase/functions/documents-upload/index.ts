// Authenticated upload proxy: browser -> us -> S3.
//
// A direct cross-origin PUT from a phone browser to S3 fails with a bare
// "Load failed", so the bytes come here as multipart/form-data and we forward
// them to storage server-side, then mark the document as uploaded.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signStorageUrl, buildObjectKey, headObject, S3_BUCKET_HINT } from "../_shared/s3.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  if (status >= 400) console.error("documents-upload", status, JSON.stringify(body));
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const str = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json(401, { error: "Missing Authorization header" });

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: userRes } = await asCaller.auth.getUser();
  if (!userRes?.user) return json(401, { error: "Not authenticated" });

  let form: FormData;
  try { form = await req.formData(); } catch { return json(400, { error: "Expected multipart/form-data" }); }

  const tenantId = str(form.get("tenant_id"));
  const type = str(form.get("type"));
  const petId = str(form.get("pet_id"));
  const customerId = str(form.get("customer_id"));
  const bookingId = str(form.get("booking_id"));
  const uploadedVia = str(form.get("uploaded_via")) === "portal" ? "portal" : "admin";
  const file = form.get("file") as File | null;

  if (!tenantId) return json(400, { error: "tenant_id required" });
  if (!type) return json(400, { error: "type required" });
  if (!file) return json(400, { error: "file required" });

  const contentType = file.type || "application/octet-stream";
  const fileName = file.name || `upload-${Date.now()}`;

  const { data: settings } = await admin
    .from("document_settings").select("max_upload_mb").eq("tenant_id", tenantId).maybeSingle();
  const maxMb = Number(settings?.max_upload_mb ?? 20);
  if (file.size > maxMb * 1024 * 1024) return json(413, { error: `File exceeds ${maxMb}MB limit` });

  // Insert as the caller so RLS decides whether they may attach to this target.
  const insert = await asCaller
    .from("documents")
    .insert({
      tenant_id: tenantId,
      pet_id: petId,
      customer_id: customerId,
      booking_id: bookingId,
      type,
      file_name: fileName,
      content_type: contentType,
      size_bytes: file.size,
      storage_provider: "s3",
      s3_bucket: S3_BUCKET_HINT,
      status: "pending",
      uploaded_via: uploadedVia,
    })
    .select("id")
    .single();
  if (insert.error) return json(403, { error: insert.error.message });

  const docId = insert.data.id as string;
  const key = buildObjectKey({ tenantId, petId, customerId, docId, fileName });
  await admin.from("documents").update({ s3_key: key }).eq("id", docId);

  try {
    const signed = await signStorageUrl(key, "write");
    const bytes = await file.arrayBuffer();
    const put = await fetch(signed.url, {
      method: signed.method ?? "PUT",
      body: bytes,
      headers: { "Content-Type": contentType },
    });
    if (!put.ok) {
      const text = await put.text().catch(() => "");
      console.error("documents-upload S3 PUT failed", put.status, text.slice(0, 300));
      await admin.from("documents").delete().eq("id", docId);
      return json(502, { error: `Storage rejected the file (${put.status})` });
    }
  } catch (e) {
    console.error("documents-upload forward failed", String(e));
    await admin.from("documents").delete().eq("id", docId);
    return json(502, { error: (e as Error).message });
  }

  let etag: string | null = null;
  try { etag = (await headObject(key)).etag; } catch { /* non-fatal */ }

  const upd = await admin.from("documents")
    .update({ status: "uploaded", size_bytes: file.size, checksum: etag, content_type: contentType })
    .eq("id", docId);
  if (upd.error) return json(500, { error: upd.error.message });

  return json(200, { document_id: docId, file_name: fileName });
});
