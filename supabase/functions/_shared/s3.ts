// Small helpers for the Sloppy Kisses S3 document store.
// All calls go through the Lovable connector gateway, so we never see
// raw AWS credentials — the gateway signs requests and returns signed
// URLs the browser can PUT/GET directly.

const GATEWAY_BASE = "https://connector-gateway.lovable.dev";
const GATEWAY_S3 = `${GATEWAY_BASE}/aws_s3`;

export function getS3Env() {
  const lovable = Deno.env.get("LOVABLE_API_KEY");
  const s3Key = Deno.env.get("AWS_S3_API_KEY");
  if (!lovable) throw new Error("LOVABLE_API_KEY is not configured");
  if (!s3Key) throw new Error("AWS_S3_API_KEY is not configured");
  return { lovable, s3Key };
}

function gwHeaders() {
  const { lovable, s3Key } = getS3Env();
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": s3Key,
  };
}

export async function signStorageUrl(
  objectPath: string,
  mode: "read" | "write",
): Promise<{ url: string; expires_in: number; method: string }> {
  const res = await fetch(
    `${GATEWAY_BASE}/api/v1/sign_storage_url?provider=aws_s3&mode=${mode}`,
    {
      method: "POST",
      headers: { ...gwHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ object_path: objectPath }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sign ${mode} URL failed [${res.status}]: ${body}`);
  }
  return await res.json();
}

export async function headObject(objectPath: string) {
  const res = await fetch(`${GATEWAY_S3}/${objectPath}`, {
    method: "HEAD",
    headers: gwHeaders(),
  });
  if (!res.ok) throw new Error(`HEAD failed [${res.status}]`);
  return {
    size: Number(res.headers.get("Content-Length") ?? 0),
    contentType: res.headers.get("Content-Type") ?? "application/octet-stream",
    etag: (res.headers.get("ETag") ?? "").replace(/"/g, ""),
  };
}

export async function deleteObject(objectPath: string) {
  // gateway does not proxy DELETE — we do it via a signed URL trick would need write scope.
  // Instead, rely on lifecycle rules OR delegate via signed URL: request write mode
  // returns a PUT URL for that object; deleting is not supported through signed URL.
  // For now we ask the gateway with method DELETE; if unsupported, we leave the object
  // for the bucket lifecycle to reap.
  try {
    const res = await fetch(`${GATEWAY_S3}/${objectPath}`, {
      method: "DELETE",
      headers: gwHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Object key layout — keep predictable, tenant-scoped.
export function buildObjectKey(input: {
  tenantId: string;
  petId?: string | null;
  customerId?: string | null;
  docId: string;
  fileName: string;
}) {
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  const base = input.petId
    ? `tenants/${input.tenantId}/pets/${input.petId}`
    : input.customerId
      ? `tenants/${input.tenantId}/customers/${input.customerId}`
      : `tenants/${input.tenantId}/misc`;
  return `${base}/${input.docId}-${safeName}`;
}

export const S3_BUCKET_HINT = "sloppykisses-docs";