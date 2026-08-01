import { supabase } from "@/lib/supabase/client";

export type DocumentUploadInput = {
  tenantId: string;
  petId?: string | null;
  customerId?: string | null;
  type: string; // e.g. "vaccination", "other"
  file: File;
  uploadedVia?: "portal" | "admin";
};

// Full three-step S3 upload: sign → PUT → confirm.
// Throws on any failure — caller shows the toast.
export async function uploadDocumentToS3(input: DocumentUploadInput) {
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

export async function getDocumentDownloadUrl(documentId: string) {
  const res = await supabase.functions.invoke("documents-sign-download", {
    body: { document_id: documentId },
  });
  if (res.error) throw new Error(res.error.message);
  return res.data as { download_url: string; file_name: string; expires_in: number };
}