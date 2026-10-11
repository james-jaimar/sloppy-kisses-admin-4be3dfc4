import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { toSquareJpeg } from "@/features/pets/photo/squareImage";
import type { Selections } from "./queries";

export const GROOMING_REF_BUCKET = "grooming-references";

export interface BoutiqueStyle {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  image_path: string | null;
  selections: Selections;
  medical_flags: string[];
  notes: string | null;
  active: boolean;
  sort_order: number;
}

export function useBoutiqueStyles(tenantId: string | null | undefined, opts?: { includeInactive?: boolean }) {
  return useQuery({
    queryKey: ["grooming_boutique_styles", tenantId, opts?.includeInactive ?? false],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<BoutiqueStyle[]> => {
      let q = supabase.from("grooming_boutique_styles" as any).select("*").eq("tenant_id", tenantId as string)
        .order("sort_order").order("name");
      if (!opts?.includeInactive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BoutiqueStyle[];
    },
  });
}

export function useUpsertBoutiqueStyle(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<BoutiqueStyle> & { name: string }) => {
      const payload: any = { tenant_id: tenantId, ...row };
      const { error } = await supabase.from("grooming_boutique_styles" as any).upsert(payload, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grooming_boutique_styles"] }),
  });
}

export function useDeleteBoutiqueStyle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("grooming_boutique_styles" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grooming_boutique_styles"] }),
  });
}

/** Upload a reference picture. kind "styles" = boutique style picture (publicly viewable). */
export async function uploadGroomingReference(tenantId: string, kind: "styles" | "pets", file: File): Promise<string> {
  const img = await toSquareJpeg(file, 1000, 0.85);
  const path = `${tenantId}/${kind}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(GROOMING_REF_BUCKET).upload(path, img, {
    contentType: "image/jpeg", cacheControl: "3600",
  });
  if (error) throw error;
  return path;
}

const urlCache = new Map<string, string>();

export function useGroomingRefUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(path ? urlCache.get(path) ?? null : null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    if (urlCache.has(path)) { setUrl(urlCache.get(path)!); return; }
    let cancelled = false;
    supabase.storage.from(GROOMING_REF_BUCKET).createSignedUrl(path, 60 * 60 * 6).then(({ data }) => {
      if (cancelled || !data?.signedUrl) return;
      urlCache.set(path, data.signedUrl);
      setUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [path]);
  return url;
}
