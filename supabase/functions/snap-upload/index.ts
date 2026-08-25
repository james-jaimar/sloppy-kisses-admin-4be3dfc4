// Phone -> desktop upload handoff ("snap").
//
// A signed-in user creates a short-lived, single-target upload session; the QR
// code opens /snap/<token> on a phone. The phone is NOT signed in — the token is
// the credential, and it can only ever write into that one target.
//
// Actions: create (auth), info (token), sign (token), confirm (token).

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

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

function json(status: number, body: unknown) {
  if (status >= 400) console.error("snap-upload", status, JSON.stringify(body));
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const PRODUCT_IMAGE_BUCKET = "product-images";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

async function loadSession(token: string) {
  const { data } = await admin
    .from("upload_sessions")
    .select("id, tenant_id, pet_id, customer_id, booking_id, product_id, mode, doc_type, label, expires_at, max_files, files_uploaded, closed_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return { error: "not_found" as const };
  if (data.closed_at) return { error: "closed" as const };
  if (new Date(data.expires_at).getTime() < Date.now()) return { error: "expired" as const };
  return { session: data };
}

/** Saves a shop product photo into Supabase storage and points the product at it. */
async function saveProductPhoto(s: any, productId: string, file: File) {
  const { data: product } = await admin
    .from("products")
    .select("id, tenant_id, image_url")
    .eq("id", productId)
    .maybeSingle();
  if (!product || product.tenant_id !== s.tenant_id) return json(403, { error: "forbidden" });
  if (s.mode !== "studio" && s.product_id && s.product_id !== productId) {
    return json(403, { error: "forbidden" });
  }

  const contentType = file.type || "image/jpeg";
  if (!IMAGE_TYPES.includes(contentType)) return json(415, { error: "unsupported_type" });

  const { data: settings } = await admin
    .from("document_settings").select("max_upload_mb").eq("tenant_id", s.tenant_id).maybeSingle();
  const maxMb = Number(settings?.max_upload_mb ?? 20);
  if (file.size > maxMb * 1024 * 1024) return json(413, { error: `File exceeds ${maxMb}MB limit` });

  const nameExt = (file.name.split(".").pop() ?? "").toLowerCase();
  const ext = nameExt && nameExt.length <= 5
    ? nameExt
    : contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `${s.tenant_id}/${productId}-${Date.now()}.${ext}`;

  const { error: upErr } = await admin.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, new Uint8Array(await file.arrayBuffer()), { contentType, upsert: true, cacheControl: "3600" });
  if (upErr) return json(502, { error: upErr.message });

  const { error: setErr } = await admin.from("products").update({ image_url: path }).eq("id", productId);
  if (setErr) return json(500, { error: setErr.message });

  if (product.image_url && !/^https?:\/\//i.test(product.image_url)) {
    await admin.storage.from(PRODUCT_IMAGE_BUCKET).remove([product.image_url]).catch(() => undefined);
  }
  await admin.from("upload_sessions")
    .update({ files_uploaded: Number(s.files_uploaded) + 1 })
    .eq("id", s.id);

  return json(200, { product_id: productId, image_path: path });
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // ---- multipart upload (phone -> us -> S3) -----------------------------
  // The phone posts the bytes here and we PUT to storage server-side. This
  // avoids a cross-origin PUT from a mobile browser straight to S3, which is
  // what fails with a bare "Load failed".
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try { form = await req.formData(); } catch { return json(400, { error: "invalid_form" }); }
    const token = String(form.get("token") ?? "");
    const file = form.get("file") as File | null;
    if (!token) return json(400, { error: "token required" });
    if (!file) return json(400, { error: "file required" });

    const loaded = await loadSession(token);
    if ("error" in loaded) return json(loaded.error === "not_found" ? 404 : 410, { error: loaded.error });
    const s = loaded.session!;

    if (Number(s.files_uploaded) >= Number(s.max_files)) return json(429, { error: "limit_reached" });

    // Shop product photos live in Supabase storage, not the documents/S3 pipeline.
    const productId = String(form.get("product_id") ?? "") || (s.mode === "single" ? s.product_id : null);
    if (productId) return await saveProductPhoto(s, productId, file);

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.includes(contentType)) return json(415, { error: "unsupported_type" });

    const { data: settings } = await admin
      .from("document_settings").select("max_upload_mb").eq("tenant_id", s.tenant_id).maybeSingle();
    const maxMb = Number(settings?.max_upload_mb ?? 20);
    if (file.size > maxMb * 1024 * 1024) return json(413, { error: `File exceeds ${maxMb}MB limit` });

    const fileName = file.name || `photo-${Date.now()}.jpg`;
    const { data: doc, error: insErr } = await admin
      .from("documents")
      .insert({
        tenant_id: s.tenant_id,
        pet_id: s.pet_id,
        customer_id: s.customer_id,
        booking_id: s.booking_id,
        type: s.doc_type,
        file_name: fileName,
        content_type: contentType,
        size_bytes: file.size,
        storage_provider: "s3",
        s3_bucket: S3_BUCKET_HINT,
        status: "pending",
        uploaded_via: "phone",
        upload_session_id: s.id,
      })
      .select("id")
      .single();
    if (insErr) return json(500, { error: insErr.message });

    const key = buildObjectKey({
      tenantId: s.tenant_id, petId: s.pet_id, customerId: s.customer_id, docId: doc.id, fileName,
    });
    await admin.from("documents").update({ s3_key: key }).eq("id", doc.id);

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
        console.error("snap-upload S3 PUT failed", put.status, text.slice(0, 300));
        await admin.from("documents").delete().eq("id", doc.id);
        return json(502, { error: `Storage rejected the file (${put.status})` });
      }
    } catch (e) {
      console.error("snap-upload forward failed", String(e));
      await admin.from("documents").delete().eq("id", doc.id);
      return json(502, { error: (e as Error).message });
    }

    let etag: string | null = null;
    try { etag = (await headObject(key)).etag; } catch { /* non-fatal */ }

    await admin.from("documents")
      .update({ status: "uploaded", size_bytes: file.size, checksum: etag })
      .eq("id", doc.id);
    await admin.from("upload_sessions")
      .update({ files_uploaded: Number(s.files_uploaded) + 1 })
      .eq("id", s.id);

    return json(200, { document_id: doc.id, file_name: fileName });
  }

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const action = String(body.action ?? "");

  // ---- create -----------------------------------------------------------
  if (action === "create") {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json(401, { error: "not_authenticated" });
    const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await asCaller.auth.getUser();
    if (!userRes?.user) return json(401, { error: "not_authenticated" });

    const { data: profile } = await admin
      .from("profiles").select("id").eq("auth_user_id", userRes.user.id).maybeSingle();
    if (!profile) return json(403, { error: "no_profile" });

    const tenantId = body.tenant_id as string | undefined;
    if (!tenantId) return json(400, { error: "tenant_id required" });

    const mode = body.mode === "studio" || body.mode === "barcodes" ? String(body.mode) : "single";

    // The caller must already be able to read the target through RLS.
    if (body.pet_id) {
      const { data: pet } = await asCaller.from("pets").select("id").eq("id", body.pet_id).maybeSingle();
      if (!pet) return json(403, { error: "forbidden" });
    } else if (body.customer_id) {
      const { data: cust } = await asCaller.from("customers").select("id").eq("id", body.customer_id).maybeSingle();
      if (!cust) return json(403, { error: "forbidden" });
    }
    if (body.product_id) {
      const { data: prod } = await asCaller.from("products").select("id").eq("id", body.product_id).maybeSingle();
      if (!prod) return json(403, { error: "forbidden" });
    } else if (mode === "studio" || mode === "barcodes") {
      // Catalogue-wide sessions — prove the caller can read the catalogue.
      const { data: any1 } = await asCaller
        .from("products").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle();
      if (!any1) return json(403, { error: "forbidden" });
    }

    const { data: settings } = await admin
      .from("document_settings")
      .select("snap_expiry_minutes, snap_max_files")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const minutes = Number(settings?.snap_expiry_minutes ?? 15);
    const maxFiles = mode === "barcodes" ? 1000 : mode === "studio" ? 200 : Number(settings?.snap_max_files ?? 10);

    const token = newToken();
    const { data: session, error } = await admin
      .from("upload_sessions")
      .insert({
        tenant_id: tenantId,
        token,
        pet_id: body.pet_id ?? null,
        customer_id: body.customer_id ?? null,
        booking_id: body.booking_id ?? null,
        product_id: body.product_id ?? null,
        mode,
        doc_type: body.doc_type ?? "other",
        label: body.label ?? null,
        created_by_profile_id: profile.id,
        expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
        max_files: maxFiles,
      })
      .select("id, token, expires_at, max_files")
      .single();
    if (error) return json(500, { error: error.message });
    return json(200, session);
  }


  // ---- token-authorised actions ----------------------------------------
  const token = String(body.token ?? "");
  if (!token) return json(400, { error: "token required" });
  const loaded = await loadSession(token);
  if ("error" in loaded) return json(loaded.error === "not_found" ? 404 : 410, { error: loaded.error });
  const s = loaded.session!;

  if (action === "info") {
    const { data: tenant } = await admin.from("tenants").select("name").eq("id", s.tenant_id).maybeSingle();
    return json(200, {
      label: s.label,
      doc_type: s.doc_type,
      mode: s.mode,
      product_id: s.product_id,
      expires_at: s.expires_at,
      max_files: s.max_files,
      files_uploaded: s.files_uploaded,
      business_name: tenant?.name ?? null,
    });
  }

  // ---- studio / barcodes: browse the tenant's products from the phone -----
  if (action === "products") {
    const search = String(body.search ?? "").trim();
    const missingOnly = body.missing_only === true;
    const missingBarcodeOnly = body.missing_barcode_only === true;
    let q = admin
      .from("products")
      .select("id, name, sku, barcode, size_pack, variant_label, image_url")
      .eq("tenant_id", s.tenant_id)
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(Number(body.limit ?? 60));
    if (s.mode === "single" && s.product_id) q = q.eq("id", s.product_id);
    if (missingOnly) q = q.is("image_url", null);
    if (missingBarcodeOnly) q = q.is("barcode", null);
    if (search) {
      const like = `%${search}%`;
      q = q.or(`name.ilike.${like},sku.ilike.${like},barcode.ilike.${like},external_code.ilike.${like}`);
    }
    const { data, error } = await q;
    if (error) return json(500, { error: error.message });
    const rows = (data ?? []).map((p: any) => ({
      ...p,
      image_public_url: p.image_url
        ? (/^https?:\/\//i.test(p.image_url)
            ? p.image_url
            : `${SUPABASE_URL}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${p.image_url}`)
        : null,
    }));
    return json(200, { products: rows });
  }

  // ---- barcodes: how much of the catalogue still needs a code -------------
  if (action === "barcode_counts") {
    const [{ count: total }, { count: missing }] = await Promise.all([
      admin.from("products").select("id", { count: "exact", head: true })
        .eq("tenant_id", s.tenant_id).eq("active", true),
      admin.from("products").select("id", { count: "exact", head: true })
        .eq("tenant_id", s.tenant_id).eq("active", true).is("barcode", null),
    ]);
    return json(200, { total: total ?? 0, missing: missing ?? 0 });
  }

  // ---- barcodes: save a scanned code onto a product -----------------------
  if (action === "link_barcode") {
    const code = String(body.code ?? "").trim();
    const productId = String(body.product_id ?? "");
    if (!code) return json(400, { error: "code required" });
    if (!productId) return json(400, { error: "product_id required" });
    if (s.mode !== "barcodes" && s.product_id !== productId) return json(403, { error: "forbidden" });

    const { data: product } = await admin
      .from("products").select("id, tenant_id, name").eq("id", productId).maybeSingle();
    if (!product || product.tenant_id !== s.tenant_id) return json(403, { error: "forbidden" });

    const { data: clash } = await admin
      .from("product_barcodes")
      .select("id, product_id, products(name)")
      .eq("tenant_id", s.tenant_id)
      .ilike("code", code)
      .maybeSingle();
    if (clash && clash.product_id !== productId) {
      return json(409, { error: `That code is already on “${(clash as any).products?.name ?? "another product"}”.` });
    }
    if (clash) return json(200, { ok: true, product_id: productId, code, already: true });

    const { data: retail } = await admin
      .from("retail_settings").select("allow_multi_barcode").eq("tenant_id", s.tenant_id).maybeSingle();
    if (!retail?.allow_multi_barcode) {
      await admin.from("product_barcodes").delete().eq("product_id", productId);
    }

    const { error: insErr } = await admin.from("product_barcodes").insert({
      tenant_id: s.tenant_id,
      product_id: productId,
      code,
      is_primary: true,
    });
    if (insErr) return json(500, { error: insErr.message });

    await admin.from("pos_barcode_queue")
      .update({ resolved_product_id: productId, resolved_at: new Date().toISOString() })
      .eq("tenant_id", s.tenant_id).eq("code", code);

    await admin.from("upload_sessions")
      .update({ files_uploaded: Number(s.files_uploaded) + 1 })
      .eq("id", s.id);

    return json(200, { ok: true, product_id: productId, code, product_name: product.name });
  }

  // ---- keep an actively-used session alive -------------------------------
  if (action === "extend") {
    const { data: settings } = await admin
      .from("document_settings").select("snap_expiry_minutes").eq("tenant_id", s.tenant_id).maybeSingle();
    const minutes = Number(settings?.snap_expiry_minutes ?? 15);
    const expires = new Date(Date.now() + minutes * 60_000).toISOString();
    await admin.from("upload_sessions").update({ expires_at: expires }).eq("id", s.id);
    return json(200, { expires_at: expires });
  }


  if (action === "sign") {
    if (Number(s.files_uploaded) >= Number(s.max_files)) return json(429, { error: "limit_reached" });
    const fileName = String(body.file_name ?? "");
    const contentType = String(body.content_type ?? "application/octet-stream");
    if (!fileName) return json(400, { error: "file_name required" });
    if (!ALLOWED_TYPES.includes(contentType)) return json(415, { error: "unsupported_type" });

    const { data: settings } = await admin
      .from("document_settings").select("max_upload_mb").eq("tenant_id", s.tenant_id).maybeSingle();
    const maxMb = Number(settings?.max_upload_mb ?? 20);
    if (Number(body.size_bytes ?? 0) > maxMb * 1024 * 1024) return json(413, { error: `File exceeds ${maxMb}MB limit` });

    const { data: doc, error } = await admin
      .from("documents")
      .insert({
        tenant_id: s.tenant_id,
        pet_id: s.pet_id,
        customer_id: s.customer_id,
        booking_id: s.booking_id,
        type: s.doc_type,
        file_name: fileName,
        content_type: contentType,
        size_bytes: body.size_bytes ?? null,
        storage_provider: "s3",
        s3_bucket: S3_BUCKET_HINT,
        status: "pending",
        uploaded_via: "phone",
        upload_session_id: s.id,
      })
      .select("id")
      .single();
    if (error) return json(500, { error: error.message });

    const key = buildObjectKey({
      tenantId: s.tenant_id, petId: s.pet_id, customerId: s.customer_id, docId: doc.id, fileName,
    });
    await admin.from("documents").update({ s3_key: key }).eq("id", doc.id);
    try {
      const signed = await signStorageUrl(key, "write");
      return json(200, { document_id: doc.id, upload_url: signed.url, method: signed.method });
    } catch (e) {
      await admin.from("documents").delete().eq("id", doc.id);
      return json(502, { error: (e as Error).message });
    }
  }

  if (action === "close") {
    await admin.from("upload_sessions").update({ closed_at: new Date().toISOString() }).eq("id", s.id);
    return json(200, { ok: true });
  }

  if (action === "confirm") {
    const docId = String(body.document_id ?? "");
    if (!docId) return json(400, { error: "document_id required" });
    const { data: doc } = await admin
      .from("documents").select("id, s3_key, upload_session_id").eq("id", docId).maybeSingle();
    if (!doc || doc.upload_session_id !== s.id) return json(404, { error: "not_found" });

    let size: number | null = typeof body.client_size_bytes === "number" ? body.client_size_bytes : null;
    let etag: string | null = null;
    try {
      const head = await headObject(doc.s3_key!);
      size = head.size;
      etag = head.etag;
    } catch (err) {
      console.error("snap-upload headObject failed", doc.s3_key, String(err));
    }
    await admin.from("documents").update({ status: "uploaded", size_bytes: size, checksum: etag }).eq("id", docId);
    await admin
      .from("upload_sessions")
      .update({ files_uploaded: Number(s.files_uploaded) + 1 })
      .eq("id", s.id);
    return json(200, { ok: true });
  }

  return json(400, { error: "unknown_action" });
});
