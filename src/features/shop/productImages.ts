import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export const PRODUCT_IMAGE_BUCKET = "product-images";

function extOf(file: File) {
  const fromName = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (fromName && fromName.length <= 5) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

/** Upload a product photo. Returns the storage path to store in products.image_url. */
export async function uploadProductImage(tenantId: string, productId: string, file: File): Promise<string> {
  const path = `${tenantId}/${productId}-${Date.now()}.${extOf(file)}`;
  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || "image/jpeg",
    cacheControl: "3600",
  });
  if (error) throw error;
  return path;
}

export async function deleteProductImage(path: string) {
  if (!path || /^https?:\/\//i.test(path)) return;
  await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
}

const cache = new Map<string, string>();

/** Resolve storage paths (or plain URLs) to displayable image URLs. */
export function useProductImageUrls(paths: (string | null | undefined)[]) {
  const wanted = Array.from(new Set(paths.filter(Boolean) as string[]));
  const key = wanted.join("|");
  const [map, setMap] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const p of wanted) if (cache.has(p)) seed[p] = cache.get(p)!;
    return seed;
  });

  useEffect(() => {
    let cancelled = false;
    const direct = wanted.filter((p) => /^https?:\/\//i.test(p));
    const missing = wanted.filter((p) => !/^https?:\/\//i.test(p) && !cache.has(p));
    for (const p of direct) cache.set(p, p);

    async function run() {
      if (missing.length) {
        const { data } = await supabase.storage
          .from(PRODUCT_IMAGE_BUCKET)
          .createSignedUrls(missing, 60 * 60 * 6);
        for (const row of data ?? []) {
          if (row.signedUrl && row.path) cache.set(row.path, row.signedUrl);
        }
      }
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const p of wanted) if (cache.has(p)) next[p] = cache.get(p)!;
      setMap(next);
    }
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (path: string | null | undefined) => (path ? map[path] ?? null : null);
}

/** Invalidate a cached signed URL after replacing an image. */
export function forgetProductImage(path: string | null | undefined) {
  if (path) cache.delete(path);
}
