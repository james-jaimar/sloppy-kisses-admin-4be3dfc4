import { supabase } from "@/lib/supabase/client";

export type DocumentUploadInput = {
  tenantId: string;
  petId?: string | null;
  customerId?: string | null;
  bookingId?: string | null;
  type: string; // e.g. "vaccination", "other"
  file: File;
  uploadedVia?: "portal" | "admin";
};

/**
 * Preferred path: post the bytes to our own edge function, which forwards them
 * to storage server-side. A cross-origin PUT straight to S3 from a mobile
 * browser fails with a bare "Load failed", so we never ask the device to do it.
 */
async function uploadViaProxy(input: DocumentUploadInput) {
  const form = new FormData();
  form.append("tenant_id", input.tenantId);
  form.append("type", input.type);
  if (input.petId) form.append("pet_id", input.petId);
  if (input.customerId) form.append("customer_id", input.customerId);
  if (input.bookingId) form.append("booking_id", input.bookingId);
  form.append("uploaded_via", input.uploadedVia ?? "portal");
  form.append("file", input.file, input.file.name || `upload-${Date.now()}`);

  const res = await supabase.functions.invoke("documents-upload", { body: form });
  if (res.error) {
    const details = (res.error as any)?.context
      ? await (res.error as any).context.text?.().catch(() => null)
      : null;
    let message = details || res.error.message;
    try { message = JSON.parse(details as string)?.error ?? message; } catch { /* plain text */ }
    throw new Error(message);
  }
  return res.data as { document_id: string };
}

// Fallback three-step S3 upload: sign → PUT → confirm.
async function uploadDirectToS3(input: DocumentUploadInput) {
  const signRes = await supabase.functions.invoke("documents-sign-upload", {
    body: {
      tenant_id: input.tenantId,
      pet_id: input.petId ?? null,
      customer_id: input.customerId ?? null,
      file_name: input.file.name,
      content_type: input.file.type || "application/octet-stream",
      size_bytes: input.file.size,
      type: input.type,
      uploaded_via: input.uploadedVia ?? "portal",
    },
  });
  if (signRes.error) {
    const details = (signRes.error as any)?.context
      ? await (signRes.error as any).context.text?.().catch(() => null)
      : null;
    throw new Error(details || signRes.error.message);
  }
  const { document_id, upload_url } = signRes.data as { document_id: string; upload_url: string };

  const putRes = await fetch(upload_url, {
    method: "PUT",
    body: input.file,
    headers: { "Content-Type": input.file.type || "application/octet-stream" },
  });
  if (!putRes.ok) {
    throw new Error(`Upload to S3 failed (${putRes.status})`);
  }

  const confirm = await supabase.functions.invoke("documents-confirm-upload", {
    body: {
      document_id,
      client_size_bytes: input.file.size,
      client_content_type: input.file.type || "application/octet-stream",
    },
  });
  if (confirm.error) {
    const details = (confirm.error as any)?.context
      ? await (confirm.error as any).context.text?.().catch(() => null)
      : null;
    throw new Error(details || confirm.error.message);
  }

  return { document_id };
}

/**
 * Upload a document. Goes through the server-side proxy; only falls back to the
 * direct signed-PUT chain if the proxy itself is unreachable.
 */
export async function uploadDocumentToS3(input: DocumentUploadInput) {
  try {
    return await uploadViaProxy(input);
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    const unreachable =
      msg.includes("Failed to fetch") || msg.includes("Load failed") ||
      msg.includes("NetworkError") || msg.includes("404");
    if (!unreachable) throw err;
    return await uploadDirectToS3(input);
  }
}

export async function getDocumentDownloadUrl(documentId: string) {
  const res = await supabase.functions.invoke("documents-sign-download", {
    body: { document_id: documentId },
  });
  if (res.error) throw new Error(res.error.message);
  return res.data as { download_url: string; file_name: string; expires_in: number };
}